"""
Hermes Agent Engine FastAPI Service Boundary.
"""

import asyncio
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from hermes.app.config import settings
from hermes.app.tasks import task_manager, TaskState, ApprovalState
from hermes.app.workspace.manager import workspace_manager
from hermes.app.agent import agent_engine

app = FastAPI(
    title="Hermes Agent Engine",
    description="Autonomous Agent Engine microservice for Nexa",
    version="0.1.0"
)


class TaskRequest(BaseModel):
    task: str = Field(..., description="The task prompt/description for the agent")
    session_id: Optional[str] = Field(None, description="Optional session identifier")
    repository: Optional[str] = Field(None, description="Optional GitHub repository (owner/name)")
    branch: Optional[str] = Field(None, description="Optional Git branch name")


class ApprovalRequest(BaseModel):
    action: str = Field(..., description="Approval action: 'approve' or 'reject'")


class PushTaskRequest(BaseModel):
    commit_message: str = Field(..., description="Commit message for the push operation")
    token: Optional[str] = Field(None, description="GitHub Access Token passed from session")


async def run_agent_background(task_id: str, task: str, workspace_path: str, repository: Optional[str] = None, branch: Optional[str] = None):
    """
    Background worker that updates task states, clones repo/branch if specified, and invokes Hermes CLI asynchronously.
    """
    import os
    try:
        target_dir = workspace_path
        if repository and branch:
            task_manager.update_task_status(task_id, TaskState.PREPARING)
            repo_dir = workspace_manager.prepare_repository(
                workspace_path=workspace_path,
                repository=repository,
                branch=branch
            )
            if os.path.exists(repo_dir):
                target_dir = repo_dir

        task_manager.update_task_status(task_id, TaskState.RUNNING)
        output = await agent_engine.run_task(task_id, task, target_dir)

        # Inspect diff output in sandbox
        diff_data = workspace_manager.get_workspace_diff(workspace_path)

        if output.get("success"):
            task_manager.update_task_status(
                task_id,
                TaskState.COMPLETED,
                result=output.get("result"),
                diff_data=diff_data
            )
        else:
            task_manager.update_task_status(
                task_id,
                TaskState.FAILED,
                error=output.get("error")
            )
    except Exception as e:
        task_manager.update_task_status(
            task_id,
            TaskState.FAILED,
            error=str(e)
        )


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "nexa-hermes",
        "hermes_version": "0.20.6"
    }


@app.get("/api/agent/status")
async def agent_status():
    return {
        "status": "idle",
        "ready": True,
        "active_tasks": 0
    }


@app.post("/task", status_code=status.HTTP_200_OK)
async def create_task(req: TaskRequest):
    task_text = req.task.strip() if req.task else ""
    if not task_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mesej tugasan tidak boleh kosong."
        )

    if len(task_text) > 5000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Saiz mesej tugasan melebihi had 5000 aksara."
        )

    # 1. Generate task record ID
    # Note: We need workspace path before creating task record
    # Generates unique ID format
    import uuid
    safe_task_id = f"task_{uuid.uuid4().hex[:12]}"
    workspace_path = workspace_manager.create_workspace(safe_task_id)

    task_record = task_manager.create_task(
        task=task_text,
        workspace_path=workspace_path,
        session_id=req.session_id,
        task_id=safe_task_id,
        repository=req.repository,
        branch=req.branch
    )
    actual_task_id = task_record["task_id"]

    # 2. Launch background execution
    asyncio.create_task(
        run_agent_background(
            actual_task_id,
            task_text,
            workspace_path,
            repository=req.repository,
            branch=req.branch
        )
    )

    return {
        "status": "accepted",
        "task_id": actual_task_id,
        "message": "Task started"
    }


@app.get("/task/{task_id}")
async def get_task_status(task_id: str):
    task_record = task_manager.get_task(task_id)
    if not task_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tugasan tidak dijumpai."
        )

    response = {
        "task_id": task_record["task_id"],
        "status": task_record["status"],
        "workspace_path": task_record["workspace_path"],
        "updated_at": task_record["updated_at"]
    }

    if task_record["status"] == TaskState.COMPLETED:
        response["result"] = task_record["result"]
        response["approval_status"] = task_record.get("approval_status", ApprovalState.PENDING)
    elif task_record["status"] == TaskState.FAILED:
        response["error"] = task_record["error"]

    return response


@app.get("/task/{task_id}/diff")
async def get_task_diff(task_id: str):
    task_record = task_manager.get_task(task_id)
    if not task_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tugasan tidak dijumpai."
        )

    workspace_path = task_record["workspace_path"]
    diff_data = task_record.get("diff_data") or workspace_manager.get_workspace_diff(workspace_path)

    return {
        "task_id": task_record["task_id"],
        "status": task_record["status"],
        "approval_status": task_record.get("approval_status", ApprovalState.PENDING),
        "changed_files": diff_data.get("changed_files", []),
        "stat": diff_data.get("stat", "No changes"),
        "diff": diff_data.get("diff", "No file content changes detected.")
    }


@app.post("/task/{task_id}/approval")
async def update_task_approval_endpoint(task_id: str, req: ApprovalRequest):
    task_record = task_manager.get_task(task_id)
    if not task_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tugasan tidak dijumpai."
        )

    action = req.action.lower().strip()
    if action not in ["approve", "reject"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tindakan kelulusan tidak sah. Dijangka 'approve' atau 'reject'."
        )

    new_status = ApprovalState.APPROVED if action == "approve" else ApprovalState.REJECTED
    updated = task_manager.update_task_approval(task_id, new_status)

    return {
        "task_id": task_id,
        "approval_status": updated["approval_status"],
        "message": f"Tugasan berjaya dikemaskini kepada {updated['approval_status']} (Tiada operasi remote git dilakukan)."
    }


@app.post("/task/{task_id}/push")
async def push_task_changes_endpoint(task_id: str, req: PushTaskRequest):
    task_record = task_manager.get_task(task_id)
    if not task_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tugasan tidak dijumpai."
        )

    if task_record.get("approval_status") != ApprovalState.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operasi push ditolak: Perubahan mesti diluluskan ('approved') terlebih dahulu oleh manusia."
        )

    if task_record.get("status") != TaskState.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operasi push ditolak: Tugasan ejen belum selesai."
        )

    clean_message = req.commit_message.replace("\n", " ").replace("\r", " ").replace("\t", " ").strip()
    if not clean_message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operasi push ditolak: Mesej commit tidak boleh kosong."
        )

    if len(clean_message) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operasi push ditolak: Mesej commit melebihi 200 aksara."
        )

    workspace_path = task_record["workspace_path"]
    expected_repo = task_record.get("repository")
    expected_branch = task_record.get("branch")

    if not expected_repo or not expected_branch:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operasi push ditolak: Tugasan tidak dikaitkan dengan repositori dan branch GitHub."
        )

    task_manager.update_push_status(task_id, "pushing")

    try:
        push_result = workspace_manager.push_approved_changes(
            workspace_path=workspace_path,
            expected_repo=expected_repo,
            expected_branch=expected_branch,
            commit_message=clean_message,
            token=req.token
        )
        task_manager.update_push_status(task_id, "pushed")

        return {
            "task_id": task_id,
            "status": "pushed",
            "push_status": "pushed",
            "repository": push_result["repository"],
            "branch": push_result["branch"],
            "commit": push_result["commit"],
            "message": push_result["message"]
        }
    except ValueError as ve:
        task_manager.update_push_status(task_id, "push_failed")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except RuntimeError as re:
        err_str = str(re)
        if "CONFLICT" in err_str or "Remote branch changed" in err_str:
            task_manager.update_push_status(task_id, "conflict")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Remote branch changed. No force push was performed."
            )
        task_manager.update_push_status(task_id, "push_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=err_str
        )
