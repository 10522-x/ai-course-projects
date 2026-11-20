$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) { throw "Run .\scripts\setup.ps1 first." }
$env:FUNASR_MODEL_DIR = Join-Path $Root "models\paraformer-zh"
$env:MODELSCOPE_CACHE = Join-Path $Root "modelscope-cache"
& $Python -m uvicorn server:app --app-dir $Root --host 127.0.0.1 --port 8000
