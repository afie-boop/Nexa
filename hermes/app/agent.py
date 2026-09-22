"""
Hermes Agent Engine Interface & Asynchronous Execution Layer.
"""

import os
import sys
import asyncio
from typing import Dict, Any, Optional
from hermes.app.config import settings


class HermesAgentEngine:
    """
    Interface boundary for executing task runs via the installed official Hermes Agent CLI.
    """

    HERMES_CLI_PATH = os.path.expanduser("~/.local/bin/hermes")

    async def run_task(self, task_id: str, task: str, workspace_path: str) -> Dict[str, Any]:
        """
        Executes an agent task inside an isolated workspace asynchronously.
        Captures output without blocking the main event loop.
        """
        if not os.path.exists(self.HERMES_CLI_PATH):
            return {
                "success": False,
                "error": f"Hermes CLI tidak dijumpai di {self.HERMES_CLI_PATH}"
            }

        # Build isolated process environment
        env = os.environ.copy()

        # Override HOME for process isolation
        env["HOME"] = workspace_path

        # Symlink or copy global Hermes config directory (~/.hermes) into task sandbox HOME if present
        host_hermes_dir = os.path.expanduser("~/.hermes")
        task_hermes_dir = os.path.join(workspace_path, ".hermes")
        if os.path.exists(host_hermes_dir) and not os.path.exists(task_hermes_dir):
            try:
                os.symlink(host_hermes_dir, task_hermes_dir)
            except Exception:
                pass

        env["HERMES_HOME"] = task_hermes_dir

        # Map OPENROUTER_KEY if present to OPENROUTER_API_KEY for Hermes CLI
        if env.get("OPENROUTER_KEY") and not env.get("OPENROUTER_API_KEY"):
            env["OPENROUTER_API_KEY"] = env["OPENROUTER_KEY"]

        # Ensure PATH includes ~/.local/bin and standard system paths
        env["PATH"] = f"{os.path.expanduser('~/.local/bin')}:{os.path.expanduser('~/.hermes/bin')}:{env.get('PATH', '')}"

        # Safe Hermes CLI invocation arguments:
        # -z <task>: One-shot non-interactive mode
        # --in <workspace_path>: Restrict working directory to task sandbox
        # --toolsets file,terminal: Limit enabled toolsets strictly to filesystem and terminal
        # --yolo: Non-interactive execution inside isolated sandbox
        # --ignore-rules: Skip injecting host AGENTS.md/SOUL.md
        cmd = [
            self.HERMES_CLI_PATH,
            "-z", task,
            "--in", workspace_path,
            "--toolsets", "file,terminal",
            "--yolo",
            "--ignore-rules"
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workspace_path,
                env=env
            )

            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                process.communicate(),
                timeout=120.0
            )

            stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
            stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

            if process.returncode == 0:
                return {
                    "success": True,
                    "result": stdout or "Task executed successfully.",
                    "stderr": stderr
                }
            else:
                return {
                    "success": False,
                    "error": stderr or stdout or f"Process exited with code {process.returncode}"
                }

        except asyncio.TimeoutError:
            return {
                "success": False,
                "error": "Tugasan melebihi had masa (Timeout 120 saat)."
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


agent_engine = HermesAgentEngine()
