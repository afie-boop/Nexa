"""
Hermes Agent Engine Configuration.
"""

import os


class Settings:
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = os.getenv("HERMES_ENV", "development")
    PORT: int = int(os.getenv("HERMES_PORT", 8000))
    OPENROUTER_KEY: str = os.getenv("OPENROUTER_KEY", "")
    HERMES_WORKSPACE_BASE: str = os.getenv("HERMES_WORKSPACE_BASE", "/tmp/nexa-agent-workspaces")


settings = Settings()
