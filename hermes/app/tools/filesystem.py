"""
Filesystem tool boundaries for Hermes Agent.
"""

from typing import List, Optional


class FilesystemTool:
    """
    Safe filesystem operations bounded to an assigned workspace.
    """

    def __init__(self, workspace_path: str):
        self.workspace_path = workspace_path

    def read_file(self, filepath: str) -> str:
        raise NotImplementedError("Filesystem tool scaffolded; read_file not implemented yet.")

    def list_files(self, path: Optional[str] = None) -> List[str]:
        raise NotImplementedError("Filesystem tool scaffolded; list_files not implemented yet.")
