$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $Root ".venv"

if (-not (Test-Path (Join-Path $Venv "Scripts\python.exe"))) {
    py -3.12 -m venv $Venv
    if ($LASTEXITCODE -ne 0) { throw "Could not create Python 3.12 virtual environment." }
}

$Python = Join-Path $Venv "Scripts\python.exe"
$PipArgs = @(
    "-m", "pip", "install",
    "--index-url", "https://pypi.tuna.tsinghua.edu.cn/simple",
    "--trusted-host", "pypi.tuna.tsinghua.edu.cn",
    "-r", (Join-Path $Root "requirements.txt")
)
& $Python @PipArgs
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
& $Python -m pip check
if ($LASTEXITCODE -ne 0) { throw "Dependency check failed." }
