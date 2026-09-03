"""
Task Manager for tracking Hermes Agent tasks.
"""

import uuid
from typing import Dict, Any, Optional
from datetime import datetime


class TaskState:
    PENDING = "pending"
    PREPARING = "preparing"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class ApprovalState:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class TaskManager:
    """
    In-memory task manager for tracking task lifecycle states and isolated execution outputs.
    """

    def __init__(self):
        self._tasks: Dict[str, Dict[str, Any]] = {}

    def create_task(
        self,
        task: str,
        workspace_path: str,
        session_id: Optional[str] = None,
        task_id: Optional[str] = None,
        repository: Optional[str] = None,
        branch: Optional[str] = None
    ) -> Dict[str, Any]:
        actual_id = task_id or f"task_{uuid.uuid4().hex[:12]}"
        task_record = {
            "task_id": actual_id,
            "task": task,
            "session_id": session_id,
            "repository": repository,
            "branch": branch,
            "status": TaskState.PENDING,
            "approval_status": ApprovalState.PENDING,
            "workspace_path": workspace_path,
            "result": None,
            "error": None,
            "diff_data": None,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        self._tasks[task_id] = task_record
        return task_record

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        return self._tasks.get(task_id)

    def update_task_status(
        self,
        task_id: str,
        status: str,
        result: Optional[str] = None,
        error: Optional[str] = None,
        diff_data: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        if task_id in self._tasks:
            self._tasks[task_id]["status"] = status
            if result is not None:
                self._tasks[task_id]["result"] = result
            if error is not None:
                self._tasks[task_id]["error"] = error
            if diff_data is not None:
                self._tasks[task_id]["diff_data"] = diff_data
            self._tasks[task_id]["updated_at"] = datetime.utcnow().isoformat()
            return self._tasks[task_id]
        return None

    def update_push_status(self, task_id: str, push_status: str) -> Optional[Dict[str, Any]]:
        if task_id in self._tasks:
            self._tasks[task_id]["push_status"] = push_status
            self._tasks[task_id]["updated_at"] = datetime.utcnow().isoformat()
            return self._tasks[task_id]
        return None

    def update_task_approval(self, task_id: str, approval_status: str) -> Optional[Dict[str, Any]]:
        if task_id in self._tasks:
            self._tasks[task_id]["approval_status"] = approval_status
            self._tasks[task_id]["updated_at"] = datetime.utcnow().isoformat()
            return self._tasks[task_id]
        return None


task_manager = TaskManager()
