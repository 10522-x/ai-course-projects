# Local FunASR Paraformer

Windows CPU deployment for the ModelScope Paraformer-large Chinese ASR model.
The service listens only on `127.0.0.1:8000`.

## Setup

Run in PowerShell from this directory:

```powershell
.\scripts\setup.ps1
.\scripts\download_model.ps1
.\scripts\start.ps1
```

The first setup installs dependencies; model download requires internet access.
ASR, VAD, punctuation, and CAM++ speaker weights are placed under `models\`.

## Video subtitle app

After starting the service, open `http://127.0.0.1:8000`. Upload a video to
create a Chinese transcript, diarize up to two speaker labels, preview the
subtitles over the original video, and download the SRT. The preview uses a
browser subtitle track; it does not encode or modify the uploaded video.
Speaker labels are anonymous (`说话人1` and `说话人2`), not real identities.
After recognition, select transcript rows (or filter and select one speaker),
set the head/tail padding, and generate a chronological montage. The new MP4
and its retimed SRT are separate downloads; subtitles are not burned into the
video. This first version selects clips from transcript segments locally and
does not use FunClip's optional LLM-based semantic selection.

The video endpoint is `POST /api/process-video` with `file` and
`speaker_count=2` multipart fields. An optional `corrections` field accepts up
to 50 comma-separated `wrong=>correct` mappings to fix known recognition
errors in the generated transcript. This is deterministic text correction,
not model training or acoustic hotword biasing. Completed files are available
from the returned `source_video_url` and `srt_url`. The legacy `video_url` field
is retained as an alias for the original uploaded video; new jobs do not create
a subtitled MP4. The older `/api/jobs/{job_id}/video` route remains available
for completed jobs created by earlier versions.

Create a clip from the returned `job_id` and zero-based transcript segment
indices:

```json
{
  "segment_indices": [2, 5, 6],
  "head_ms": 200,
  "tail_ms": 250
}
```

Send this JSON to `POST /api/jobs/{job_id}/clips`. The response contains
`video_url`, `srt_url`, `selected_count`, `clip_count`, and `duration_ms`.
Segment metadata is saved with each new job; existing jobs can be clipped from
their saved SRT subtitles. Open `/pipeline.html?job_id=YOUR_JOB_ID` to restore
an existing result without uploading or running recognition again.

Generate a conservative automatic editing plan without encoding video:

```json
{
  "male_speaker": 1,
  "female_speaker": 2
}
```

Send this JSON to `POST /api/jobs/{job_id}/auto-edit/plan`. The response labels
each subtitle segment as `keep`, `review`, or `drop`, records the reason,
protects question-answer and error-correction groups, and returns
`suggested_indices` for the existing clip endpoint. The plan is also saved as
`auto_edit_plan.json` so the page can restore it. The first version is
rules-based and intentionally does not rewrite subtitles or burn them into the
video. Question and emotion candidates are retained even when the diarization
label is uncertain; pure filler words remain deletion candidates. Long
silences between retained segments are compressed while short pauses are kept.
See `AUTO_EDITING_RESEARCH.md` for the open-source references and integration
boundary.

Generate the automatic edit directly:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/jobs/YOUR_JOB_ID/auto-edit/clip `
  -Method Post -ContentType "application/json" `
  -Body '{"male_speaker":1,"female_speaker":2,"head_ms":160,"tail_ms":190,"max_keep_pause_ms":350}'
```

This returns a separate MP4 and retimed SRT. The automatic edit uses the
retained transcript ranges plus local WAV silence detection; it does not burn
subtitles into the video or run ASR a second time. The web workbench exposes
the same operation with the `自动分析` and `自动剪辑` controls.

For short-clip diagnosis, `speaker_count=1` disables speaker clustering while
keeping transcription and timestamps enabled. The normal web app remains in
two-speaker mode.

## API

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

Transcribe a local audio file:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8000/v1/audio/transcriptions `
  -Method Post -Form @{ file = Get-Item .\sample.wav; response_format = "json" }
```

The JSON response is `{"text":"..."}`. To request plain text, set
`response_format` to `text`. The service accepts common audio files supported
by FunASR and serializes inference requests because this deployment runs on CPU.
After all four model folders have been downloaded, startup and inference run
from local files without fetching model weights.

## Calling from another application

Send `multipart/form-data` with a `file` field to
`POST http://127.0.0.1:8000/v1/audio/transcriptions`. The API is OpenAI-style
for local integration; it has no authentication and is intentionally bound to
loopback. Keep it local unless authentication and network access controls are
added.
