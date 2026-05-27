<#
Run AIRA local dev environment.

Usage:
  - Open PowerShell in the repo root (C:\Users\Claw\Gr8bux)
  - Run: .\run_aira_dev.ps1

What it does:
  - Starts the mock Kronos service (python-kronos-service\mock_service.py) if Python is available
  - Starts the Next.js dev server (npm run dev) if Node is available

Notes:
  - This script does not install dependencies; please ensure Python and Node are installed and on PATH.
  - If you prefer, run commands manually as shown in the README.
#>

function Check-Command($name) {
    Try {
        Get-Command $name -ErrorAction Stop | Out-Null
        return $true
    } Catch {
        return $false
    }
}

$repoRoot = (Get-Location).Path
Write-Host "Repo root: $repoRoot"

if (Check-Command python) {
    Write-Host "Starting mock Kronos service using 'python'..."
    Start-Process -NoNewWindow -FilePath python -ArgumentList "python-kronos-service\mock_service.py" -WorkingDirectory $repoRoot
} elseif (Check-Command py) {
    Write-Host "Starting mock Kronos service using 'py'..."
    Start-Process -NoNewWindow -FilePath py -ArgumentList "-3 python-kronos-service\mock_service.py" -WorkingDirectory $repoRoot
} else {
    Write-Host "Python not found in PATH. Please install Python 3 and re-run the script."
}

if (Check-Command npm) {
    Write-Host "Starting Next.js dev server (npm run dev)..."
    Start-Process -NoNewWindow -FilePath npm -ArgumentList "run dev" -WorkingDirectory $repoRoot
} else {
    Write-Host "Node/npm not found in PATH. Install Node.js to run the Next dev server."
}

Write-Host "Done. Visit http://localhost:3000/aira after both servers are running."
