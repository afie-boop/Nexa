"""
Git tool boundaries for Hermes Agent.
"""

from typing import Dict, Any, Optional


class GitTool:
    """
    Git repository operations for local branches and diff previews.
    """

    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path

    def status(self) -> Dict[str, Any]:
        raise NotImplementedError("Git tool scaffolded; status interface ready.")

    def create_branch(self, branch_name: str) -> bool:
        raise NotImplementedError("Git tool scaffolded; create_branch interface ready.")
