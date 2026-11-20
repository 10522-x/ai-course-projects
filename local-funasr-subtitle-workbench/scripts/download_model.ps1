$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$ModelsDir = Join-Path $Root "models"

if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment not found. Run .\scripts\setup.ps1 first."
}

New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null
$env:MODELSCOPE_CACHE = Join-Path $Root "modelscope-cache"

$Models = @(
    @{ Id = "iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch"; Dir = "paraformer-zh"; Revision = "v2.0.4" },
    @{ Id = "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch"; Dir = "fsmn-vad"; Revision = "v2.0.4" },
    @{ Id = "iic/punc_ct-transformer_zh-cn-common-vocab272727-pytorch"; Dir = "ct-punc"; Revision = "v2.0.4" },
    @{ Id = "iic/speech_campplus_sv_zh-cn_16k-common"; Dir = "campplus"; Revision = "master" }
)

foreach ($Model in $Models) {
    $env:MODEL_SOURCE = $Model.Id
    $env:MODEL_DEST = Join-Path $ModelsDir $Model.Dir
    $env:MODEL_REVISION = $Model.Revision
    & $VenvPython -c "import os, shutil; from pathlib import Path; from modelscope.hub.snapshot_download import snapshot_download; src=Path(snapshot_download(os.environ['MODEL_SOURCE'], revision=os.environ['MODEL_REVISION'], cache_dir=os.environ['MODELSCOPE_CACHE'])); dst=Path(os.environ['MODEL_DEST']); shutil.copytree(src, dst, dirs_exist_ok=True); print(f'Model files installed at {dst}')"
    if ($LASTEXITCODE -ne 0) { throw "Download failed for $($Model.Id)." }
    if (-not (Test-Path (Join-Path $env:MODEL_DEST "config.yaml"))) {
        throw "config.yaml is missing from $env:MODEL_DEST."
    }
}
