# Hermes Agent Engine Integration for Nexa

## Overview

Hermes is an autonomous Agent Engine designed to run as a dedicated microservice alongside Nexa AI. It handles complex, multi-step engineering tasks, git branch operations, and tool interactions safely within isolated workspaces.

## Architectural Context

```
Nexa React Frontend
        ↓
Nexa Node.js Express Gateway (/chat & /api/agent/*)
        ↓
Hermes Agent Engine (Python FastAPI Service on PORT 8000)
        ↓
Tools (Filesystem, Git, Terminal, GitHub) / Memory Interface / Workspace Manager
```

- **Chat Mode Isolation:** Standard direct chat operations continue running on the existing Node.js pipeline (`backend/pipeline/pipeline.js`).
- **Agent Mode:** Autonomous tasks route through `/api/agent/*` to the Hermes Python service (`hermes/app/main.py`).
- **Workspace Isolation:** All agent operations occur within isolated directories under `/tmp/nexa-agent-workspaces/<session-id>/` to protect the host working directory.

## Getting Started (Scaffold Mode)

### Dependencies
Install minimal Python service dependencies:
```bash
pip install -r hermes/requirements.txt
```

### Running Service
Start the FastAPI server:
```bash
uvicorn hermes.app.main:app --host 0.0.0.0 --port 8000 --reload
```
