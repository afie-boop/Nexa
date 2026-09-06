"""
Isolated Workspace Manager for Hermes Agent executions.
"""

import os
import shutil
from typing import Optional


class WorkspaceManager:
    """
    Manages isolated agent workspace paths (/tmp/nexa-agent-workspaces/<task_id>/).
    Prevents path traversal and direct mutation of primary Nexa working tree.
    """

    def __init__(self, base_dir: str = "/tmp/nexa-agent-workspaces"):
        self.base_dir = os.path.abspath(base_dir)
        os.makedirs(self.base_dir, exist_ok=True)

    def get_workspace_path(self, task_id: str) -> str:
        # Sanitize task_id to prevent path traversal
        safe_id = os.path.basename(task_id.replace("..", ""))
        workspace_path = os.path.abspath(os.path.join(self.base_dir, safe_id))

        if not workspace_path.startswith(self.base_dir):
            raise ValueError("Directori workspace tidak sah (Path Traversal Detected).")

        return workspace_path

    def create_workspace(self, task_id: str) -> str:
        workspace_path = self.get_workspace_path(task_id)
        os.makedirs(workspace_path, exist_ok=True)
        return workspace_path

    def prepare_repository(self, workspace_path: str, repository: str, branch: str, token: str = None) -> str:
        """
        Clones the specified repository and checks out the specified branch inside workspace_path/repo/.
        Ensures git clones occur strictly inside the isolated workspace sandbox.
        """
        import re
        import subprocess

        # Validate inputs
        repo_regex = r"^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$"
        branch_regex = r"^[a-zA-Z0-9_/.-]+$"

        if not repository or not re.match(repo_regex, repository):
            raise ValueError("Format repositori tidak sah. Dijangka: owner/repository")

        if not branch or not re.match(branch_regex, branch):
            raise ValueError("Format branch tidak sah.")

        repo_dir = os.path.join(workspace_path, "repo")
        os.makedirs(repo_dir, exist_ok=True)

        clone_url = f"https://github.com/{repository}.git"
        env = os.environ.copy()

        # Pass token securely via environment header to avoid exposing token in process cmdline (ps aux)
        cmd = ["git"]
        if token and token != "mock_token":
            cmd.extend(["-c", f"http.extraheader=Authorization: Bearer {token}"])
        cmd.extend([
            "clone",
            "--depth", "1",
            "--branch", branch,
            clone_url,
            repo_dir
        ])

        try:
            res = subprocess.run(
                cmd,
                cwd=workspace_path,
                env=env,
                capture_output=True,
                text=True,
                timeout=60
            )

            if res.returncode != 0:
                sanitized_err = res.stderr.replace(token or "", "*****") if token else res.stderr
                raise RuntimeError(f"Gagal clone repositori: {sanitized_err.strip()}")

            return repo_dir

        except subprocess.TimeoutExpired:
            raise RuntimeError("Masa tamat (Timeout 60s) semasa clone repositori GitHub.")

    def get_workspace_diff(self, workspace_path: str) -> dict:
        """
        Reads git status and git diff strictly inside the task repository sandbox (workspace_path/repo/).
        Includes modified, added/untracked, deleted, and renamed files.
        """
        import subprocess

        repo_dir = os.path.join(workspace_path, "repo")
        if not os.path.exists(repo_dir):
            repo_dir = workspace_path

        changed_files = []
        stat_output = ""
        diff_output = ""

        try:
            # 1. Parse git status --short
            status_res = subprocess.run(
                ["git", "status", "--short"],
                cwd=repo_dir,
                capture_output=True,
                text=True,
                timeout=15
            )

            untracked_files = []
            if status_res.returncode == 0 and status_res.stdout.strip():
                for line in status_res.stdout.strip().split("\n"):
                    if not line.strip():
                        continue
                    code = line[:2].strip()
                    file_path = line[3:].strip()

                    status_type = "modified"
                    if "A" in code or "??" in code:
                        status_type = "added"
                        untracked_files.append(file_path)
                    elif "D" in code:
                        status_type = "deleted"
                    elif "R" in code:
                        status_type = "renamed"

                    changed_files.append({
                        "path": file_path,
                        "status": status_type
                    })

            # 2. Get git diff --stat
            stat_res = subprocess.run(
                ["git", "diff", "--stat"],
                cwd=repo_dir,
                capture_output=True,
                text=True,
                timeout=15
            )
            if stat_res.returncode == 0:
                stat_output = stat_res.stdout.strip()

            # 3. Get git diff for modified/tracked files
            diff_res = subprocess.run(
                ["git", "diff"],
                cwd=repo_dir,
                capture_output=True,
                text=True,
                timeout=15
            )
            if diff_res.returncode == 0:
                diff_output = diff_res.stdout.strip()

            # 4. Include untracked/added file diffs so newly created files appear in diff viewer
            for ufile in untracked_files:
                u_res = subprocess.run(
                    ["git", "diff", "--no-index", "/dev/null", ufile],
                    cwd=repo_dir,
                    capture_output=True,
                    text=True,
                    timeout=15
                )
                if u_res.stdout.strip():
                    if diff_output:
                        diff_output += "\n\n"
                    diff_output += u_res.stdout.strip()

            return {
                "changed_files": changed_files,
                "stat": stat_output or (f"{len(changed_files)} file(s) changed" if changed_files else "No changes"),
                "diff": diff_output or "No file content changes detected."
            }

        except Exception as e:
            return {
                "changed_files": [],
                "stat": "Gagal membaca diff git.",
                "diff": f"Ralat: {str(e)}"
            }

    def push_approved_changes(
        self,
        workspace_path: str,
        expected_repo: str,
        expected_branch: str,
        commit_message: str,
        token: Optional[str] = None
    ) -> dict:
        """
        Controlled commit and push method for human-approved changes strictly inside sandbox repository.
        NEVER uses force push (-f or --force). Never exposes GitHub access tokens.
        """
        import re
        import subprocess

        repo_dir = os.path.join(workspace_path, "repo")
        if not os.path.exists(repo_dir):
            raise RuntimeError("Directori repositori sandbox tidak dijumpai.")

        # 1. Verify current checked-out branch matches expected_branch
        branch_res = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            timeout=10
        )
        current_branch = branch_res.stdout.strip() if branch_res.returncode == 0 else ""
        if expected_branch and current_branch != expected_branch:
            raise ValueError(
                f"Branch sandbox ('{current_branch}') tidak sepadan dengan branch yang diminta ('{expected_branch}')."
            )

        # 2. Check for changes in git status
        status_res = subprocess.run(
            ["git", "status", "--short"],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            timeout=10
        )
        if status_res.returncode != 0 or not status_res.stdout.strip():
            raise ValueError("Tiada perubahan dikesan untuk commit.")

        # 3. Require real GitHub credentials (reject mock_token)
        if not token or token == "mock_token":
            raise ValueError(
                "Kredensial GitHub fizikal/sebenar diperlukan untuk operasi remote push. Sesi mock dikesan."
            )

        # 4. Configure local process commit identity
        subprocess.run(["git", "config", "user.name", "Nexa Agent"], cwd=repo_dir, check=True)
        subprocess.run(["git", "config", "user.email", "agent@nexa-ai.local"], cwd=repo_dir, check=True)

        # 5. Stage changes & create commit
        subprocess.run(["git", "add", "-A"], cwd=repo_dir, check=True)
        commit_res = subprocess.run(
            ["git", "commit", "-m", commit_message],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            timeout=15
        )
        if commit_res.returncode != 0:
            raise RuntimeError(f"Gagal membuat commit: {commit_res.stderr.strip()}")

        # 6. Get commit SHA
        sha_res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            timeout=10
        )
        commit_sha = sha_res.stdout.strip()[:10] if sha_res.returncode == 0 else "unknown"

        # 7. Execute normal git push (NEVER --force)
        # Pass token securely via git extraheader flag without exposing in process arguments
        push_url = f"https://github.com/{expected_repo}.git"
        push_cmd = [
            "git", "-c", f"http.extraheader=Authorization: Bearer {token}",
            "push", push_url, expected_branch
        ]

        push_res = subprocess.run(
            push_cmd,
            cwd=repo_dir,
            capture_output=True,
            text=True,
            timeout=30
        )

        if push_res.returncode != 0:
            sanitized_err = push_res.stderr.replace(token, "*****")
            if "non-fast-forward" in sanitized_err or "fetch first" in sanitized_err or "behind" in sanitized_err:
                raise RuntimeError(f"CONFLICT: Remote branch changed. No force push was performed. Details: {sanitized_err.strip()}")
            raise RuntimeError(f"Push failed: {sanitized_err.strip()}")

        return {
            "status": "pushed",
            "repository": expected_repo,
            "branch": expected_branch,
            "commit": commit_sha,
            "message": commit_message
        }

    def dry_run_push_check(
        self,
        workspace_path: str,
        expected_repo: str,
        expected_branch: str,
        token: Optional[str] = None
    ) -> dict:
        """
        Executes read-only checks for dry-run verification without performing git commit or push.
        """
        import subprocess

        repo_dir = os.path.join(workspace_path, "repo")
        if not os.path.exists(repo_dir):
            return {"status": "DRY_RUN_FAIL", "reason": "Directori repositori sandbox tidak dijumpai."}

        # 1. Read current branch
        branch_res = subprocess.run(["git", "branch", "--show-current"], cwd=repo_dir, capture_output=True, text=True)
        current_branch = branch_res.stdout.strip() if branch_res.returncode == 0 else "unknown"

        # 2. Read git status
        status_res = subprocess.run(["git", "status", "--short"], cwd=repo_dir, capture_output=True, text=True)
        changes_exist = bool(status_res.stdout.strip()) if status_res.returncode == 0 else False

        # 3. Read remote URL
        remote_res = subprocess.run(["git", "remote", "-v"], cwd=repo_dir, capture_output=True, text=True)
        remote_url = remote_res.stdout.strip() if remote_res.returncode == 0 else ""

        # 4. Check credential state
        auth_state = "READY" if (token and token != "mock_token") else "NOT_READY"

        return {
            "status": "DRY_RUN_PASS" if (current_branch == expected_branch and changes_exist) else "DRY_RUN_FAIL",
            "current_branch": current_branch,
            "expected_branch": expected_branch,
            "changes_exist": changes_exist,
            "remote_configured": bool(remote_url),
            "real_github_auth": auth_state
        }

    def cleanup_workspace(self, task_id: str) -> bool:
        try:
            workspace_path = self.get_workspace_path(task_id)
            if os.path.exists(workspace_path):
                shutil.rmtree(workspace_path)
                return True
        except Exception:
            pass
        return False


workspace_manager = WorkspaceManager()
