<#
Helper to create a venv, install minimal requirements, and run the Kronos FastAPI service.

Usage (PowerShell):
  Open PowerShell in repo root and run:
    .\start_kronos_service.ps1

Notes:
- This installs only the lightweight service requirements. You still need to install
  the Kronos model dependencies (torch, transformers, etc.) appropriate for your
  platform if you want the real model to run.
- Ensure the local `kronos/` repo clone exists at the repository root (not tracked).
#>

$venvPath = "python-kronos-service\.venv"

if (-Not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python not found. Please install Python 3.8+ and ensure 'python' is on PATH." -ForegroundColor Yellow
    exit 1
}

if (-Not (Test-Path "kronos")) {
    Write-Host "Warning: 'kronos' repo directory not found at project root. The service expects a local kronos/ clone." -ForegroundColor Yellow
}

if (-Not (Test-Path $venvPath)) {
    python -m venv $venvPath
}

Write-Host "Activating venv at $venvPath"
. $venvPath\Scripts\Activate.ps1

Write-Host "Upgrading pip..."
python -m pip install --upgrade pip

Write-Host "Installing service requirements (FastAPI + Uvicorn + Pydantic)..."
pip install -r python-kronos-service\requirements-service.txt

Write-Host "NOTE: The Kronos model requires additional heavy dependencies (torch, model weights).
Review python-kronos-service/service.py and install CPU/GPU torch accordingly if you need real model inference."

Write-Host "To install CPU-only PyTorch (example):"
Write-Host "  pip install --index-url https://download.pytorch.org/whl/cpu torch"

Write-Host "Starting Kronos service (uvicorn). Press Ctrl+C to stop."
uvicorn python-kronos-service.service:app --host 0.0.0.0 --port 8000
