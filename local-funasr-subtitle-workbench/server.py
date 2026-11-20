import mimetypes
import json
import os
import re
import shutil
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from funasr import AutoModel
from funasr.models.campplus.cluster_backend import ClusterBackend
from pydantic import BaseModel, Field

from auto_edit import build_auto_edit_plan


ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get("FUNASR_MODEL_DIR", ROOT / "models" / "paraformer-zh"))
VAD_MODEL_DIR = ROOT / "models" / "fsmn-vad"
PUNC_MODEL_DIR = ROOT / "models" / "ct-punc"
SPK_MODEL_DIR = ROOT / "models" / "campplus"
WEB_DIR = ROOT / "web"
JOB_DIR = ROOT / "jobs"
VIDEO_SUFFIXES = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}
SUBTITLE_PUNCTUATION = set("，。！？、；：,.?!;:")
SENTENCE_END_PUNCTUATION = set("。！？?!")
CLAUSE_PUNCTUATION = set("，、；,:;")
SPEECH_FILLERS = {"嗯", "啊", "哦", "唉", "诶", "哎", "呃", "喔", "欸", "对", "好"}
MAX_SUBTITLE_CHARS = 28
MAX_SUBTITLE_DURATION_MS = 8_000
MAX_MERGE_GAP_MS = 1_200
MAX_MERGED_CHARS = 32
MAX_MERGED_DURATION_MS = 6_000
model = None
inference_lock = Lock()


class ShortClipClusterBackend(ClusterBackend):
    def forward(self, embeddings, **params):
        speaker_count = params.get("oracle_num")
        if (
            speaker_count is not None
            and 1 < speaker_count <= embeddings.shape[0] < 20
        ):
            return self.kmeans_cluster(embeddings, speaker_count)
        return super().forward(embeddings, **params)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    required_models = (
        (MODEL_DIR, "ASR"),
        (VAD_MODEL_DIR, "VAD"),
        (PUNC_MODEL_DIR, "punctuation"),
        (SPK_MODEL_DIR, "speaker"),
    )
    for model_path, label in required_models:
        if not (model_path / "config.yaml").exists():
            raise RuntimeError(f"{label} model not found in {model_path}.")
    model = AutoModel(
        model=str(MODEL_DIR),
        vad_model=str(VAD_MODEL_DIR),
        vad_kwargs={"max_end_silence_time": 1200},
        punc_model=str(PUNC_MODEL_DIR),
        spk_model=str(SPK_MODEL_DIR),
        device="cpu",
        disable_update=True,
    )
    model.cb_model = ShortClipClusterBackend().to("cpu")
    yield
    model = None


app = FastAPI(title="Local FunASR Video Subtitle", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok" if model is not None else "loading", "device": "cpu"}


def run_ffmpeg(args: list[str]) -> None:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")


class ClipRequest(BaseModel):
    segment_indices: list[int] = Field(min_length=1, max_length=120)
    head_ms: int = Field(default=200, ge=0, le=5_000)
    tail_ms: int = Field(default=250, ge=0, le=5_000)


class AutoEditPlanRequest(BaseModel):
    male_speaker: int = Field(default=1, ge=1, le=2)
    female_speaker: int = Field(default=2, ge=1, le=2)
    head_ms: int = Field(default=160, ge=0, le=5_000)
    tail_ms: int = Field(default=190, ge=0, le=5_000)
    max_keep_pause_ms: int = Field(default=350, ge=100, le=2_000)


class AutoEditClipRequest(AutoEditPlanRequest):
    pass


def format_srt_time(milliseconds: int) -> str:
    milliseconds = max(0, int(milliseconds))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1_000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{millis:03}"


def parse_srt_time(value: str) -> int:
    hours, minutes, remainder = value.split(":")
    seconds, milliseconds = remainder.split(",")
    return (
        int(hours) * 3_600_000
        + int(minutes) * 60_000
        + int(seconds) * 1_000
        + int(milliseconds)
    )


def load_job_segments(job_dir: Path) -> list[dict]:
    segments_path = job_dir / "segments.json"
    if segments_path.is_file():
        data = json.loads(segments_path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data

    srt_path = job_dir / "subtitles.srt"
    if not srt_path.is_file():
        raise HTTPException(status_code=404, detail="没有可用的识别结果")
    blocks = re.split(r"\r?\n\s*\r?\n", srt_path.read_text(encoding="utf-8-sig").strip())
    segments = []
    for block in blocks:
        lines = block.splitlines()
        if len(lines) < 3 or "-->" not in lines[1]:
            continue
        start_text, end_text = (part.strip() for part in lines[1].split("-->", 1))
        text = " ".join(lines[2:]).strip()
        speaker_match = re.match(r"说话人(\d+)[：:](.*)", text)
        speaker = int(speaker_match.group(1)) if speaker_match else 1
        if speaker_match:
            text = speaker_match.group(2).strip()
        segments.append(
            {
                "start": parse_srt_time(start_text),
                "end": parse_srt_time(end_text),
                "text": text,
                "speaker": speaker,
                "speaker_label": f"说话人{speaker}",
            }
        )
    if not segments:
        raise HTTPException(status_code=404, detail="没有可用的识别结果")
    return segments


def probe_video(path: Path) -> tuple[int, bool]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "无法读取视频信息")
    data = json.loads(result.stdout)
    duration_ms = round(float(data.get("format", {}).get("duration", 0)) * 1000)
    if duration_ms <= 0:
        raise RuntimeError("无法读取视频时长")
    has_audio = any(
        stream.get("codec_type") == "audio" for stream in data.get("streams", [])
    )
    return duration_ms, has_audio


def make_clip_ranges(
    segments: list[dict],
    indices: list[int],
    head_ms: int,
    tail_ms: int,
    duration_ms: int,
) -> list[dict]:
    ranges = []
    for index in sorted(set(indices)):
        segment = segments[index]
        start = max(0, int(segment["start"]) - head_ms)
        end = min(duration_ms, int(segment["end"]) + tail_ms)
        if end <= start:
            continue
        if ranges and start <= ranges[-1]["end"]:
            ranges[-1]["end"] = max(ranges[-1]["end"], end)
            ranges[-1]["segments"].append(segment)
        else:
            ranges.append({"start": start, "end": end, "segments": [segment]})
    return ranges


def render_clip(
    job_id: str,
    ranges: list[dict],
    selected_count: int,
) -> dict:
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(status_code=404, detail="视频不存在")
    job_dir = JOB_DIR / job_id
    input_files = list(job_dir.glob("input.*")) if job_dir.is_dir() else []
    if not input_files or not input_files[0].is_file():
        raise HTTPException(status_code=404, detail="视频不存在")
    if not ranges:
        raise HTTPException(status_code=400, detail="选择的字幕没有有效时间范围")
    _, has_audio = probe_video(input_files[0])
    clip_id = uuid4().hex
    clip_dir = job_dir / "clips"
    clip_dir.mkdir(exist_ok=True)
    output_path = clip_dir / f"{clip_id}.mp4"
    srt_path = clip_dir / f"{clip_id}.srt"
    filters = []
    concat_inputs = []
    clip_segments = []
    output_offset = 0
    for range_index, clip_range in enumerate(ranges):
        start = clip_range["start"] / 1000
        end = clip_range["end"] / 1000
        filters.append(
            f"[0:v:0]trim=start={start:.3f}:end={end:.3f},"
            f"setpts=PTS-STARTPTS[v{range_index}]"
        )
        concat_inputs.append(f"[v{range_index}]")
        if has_audio:
            filters.append(
                f"[0:a:0]atrim=start={start:.3f}:end={end:.3f},"
                f"asetpts=PTS-STARTPTS[a{range_index}]"
            )
            concat_inputs.append(f"[a{range_index}]")
        for segment in clip_range["segments"]:
            clip_segments.append(
                {
                    **segment,
                    "start": output_offset + max(0, int(segment["start"]) - clip_range["start"]),
                    "end": output_offset + min(
                        clip_range["end"] - clip_range["start"],
                        int(segment["end"]) - clip_range["start"],
                    ),
                }
            )
        output_offset += clip_range["end"] - clip_range["start"]

    audio_output_count = 1 if has_audio else 0
    labels = "[vout][aout]" if has_audio else "[vout]"
    filters.append(
        f"{''.join(concat_inputs)}concat=n={len(ranges)}:v=1:"
        f"a={audio_output_count}{labels}"
    )
    ffmpeg_args = [
        "-i",
        str(input_files[0]),
        "-filter_complex",
        ";\n".join(filters),
        "-map",
        "[vout]",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
    ]
    if has_audio:
        ffmpeg_args.extend(["-map", "[aout]", "-c:a", "aac", "-b:a", "160k"])
    else:
        ffmpeg_args.append("-an")
    ffmpeg_args.append(str(output_path))
    try:
        run_ffmpeg(ffmpeg_args)
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise RuntimeError("FFmpeg 未生成剪辑文件")
        srt_path.write_text(build_srt(clip_segments), encoding="utf-8-sig")
    except Exception:
        output_path.unlink(missing_ok=True)
        srt_path.unlink(missing_ok=True)
        raise

    return {
        "clip_id": clip_id,
        "video_url": f"/api/jobs/{job_id}/clips/{clip_id}/video",
        "srt_url": f"/api/jobs/{job_id}/clips/{clip_id}/srt",
        "selected_count": selected_count,
        "clip_count": len(ranges),
        "duration_ms": output_offset,
    }


def create_clip(job_id: str, request: ClipRequest) -> dict:
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(status_code=404, detail="视频不存在")
    job_dir = JOB_DIR / job_id
    if not job_dir.is_dir():
        raise HTTPException(status_code=404, detail="视频不存在")
    segments = load_job_segments(job_dir)
    indices = sorted(set(request.segment_indices))
    if any(index < 0 or index >= len(segments) for index in indices):
        raise HTTPException(status_code=400, detail="选择的字幕片段无效")
    duration_ms, _ = probe_video(next(job_dir.glob("input.*")))
    ranges = make_clip_ranges(
        segments, indices, request.head_ms, request.tail_ms, duration_ms
    )
    return render_clip(job_id, ranges, len(indices))


def create_auto_edit_plan(job_id: str, request: AutoEditPlanRequest) -> dict:
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(status_code=404, detail="任务不存在")
    if request.male_speaker == request.female_speaker:
        raise HTTPException(status_code=400, detail="男生和女生不能映射到同一个说话人")
    job_dir = JOB_DIR / job_id
    if not job_dir.is_dir():
        raise HTTPException(status_code=404, detail="任务不存在")
    input_files = list(job_dir.glob("input.*"))
    if not input_files or not input_files[0].is_file():
        raise HTTPException(status_code=404, detail="视频不存在")
    segments = load_job_segments(job_dir)
    duration_ms, _ = probe_video(input_files[0])
    audio_path = job_dir / "audio.wav"
    plan = build_auto_edit_plan(
        segments,
        male_speaker=request.male_speaker,
        female_speaker=request.female_speaker,
        audio_path=audio_path if audio_path.is_file() else None,
        duration_ms=duration_ms,
        head_ms=request.head_ms,
        tail_ms=request.tail_ms,
        max_keep_pause_ms=request.max_keep_pause_ms,
    )
    plan["job_id"] = job_id
    (job_dir / "auto_edit_plan.json").write_text(
        json.dumps(plan, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return plan


def create_auto_edit_clip(job_id: str, request: AutoEditClipRequest) -> dict:
    plan = create_auto_edit_plan(job_id, request)
    job_dir = JOB_DIR / job_id
    segments = load_job_segments(job_dir)
    ranges = []
    for clip_range in plan["clip_ranges"]:
        indices = clip_range["segment_indices"]
        ranges.append(
            {
                **clip_range,
                "segments": [segments[index] for index in indices],
            }
        )
    result = render_clip(job_id, ranges, len(plan["suggested_indices"]))
    return {
        **result,
        "auto_edit": True,
        "rules_version": plan["rules_version"],
        "summary": plan["summary"],
        "silence": plan["silence"],
    }


def split_sentence(sentence: dict) -> list[dict]:
    text = re.sub(r"\s+", " ", str(sentence.get("text") or "")).strip()
    timestamps = sentence.get("timestamp") or []
    if not text:
        return []
    if not timestamps:
        return [
            {
                **sentence,
                "text": text,
                "start": int(sentence.get("start", 0)),
                "end": max(
                    int(sentence.get("end", 0)),
                    int(sentence.get("start", 0)) + 300,
                ),
            }
        ]

    characters = list(text)
    content_indices = [
        index
        for index, character in enumerate(characters)
        if not character.isspace() and character not in SUBTITLE_PUNCTUATION
    ]
    visible_indices = [
        index for index, character in enumerate(characters) if not character.isspace()
    ]
    if len(content_indices) == len(timestamps):
        timestamp_indices = content_indices
    elif len(visible_indices) == len(timestamps):
        timestamp_indices = visible_indices
    else:
        return [
            {
                **sentence,
                "text": text,
                "start": int(sentence.get("start", timestamps[0][0])),
                "end": max(
                    int(sentence.get("end", timestamps[-1][1])),
                    int(sentence.get("start", timestamps[0][0])) + 300,
                ),
            }
        ]

    char_timestamps = {
        index: timestamp
        for index, timestamp in zip(timestamp_indices, timestamps)
    }
    content_index_by_char = {
        char_index: content_index
        for content_index, char_index in enumerate(content_indices)
    }
    if len(content_indices) <= MAX_SUBTITLE_CHARS:
        start = timestamps[0][0]
        end = max(timestamps[-1][1], start + 300)
        if end - start <= MAX_SUBTITLE_DURATION_MS:
            return [{**sentence, "text": text, "start": start, "end": end}]

    chunks = []
    char_start = 0
    while char_start < len(characters):
        while char_start < len(characters) and characters[char_start].isspace():
            char_start += 1
        if char_start >= len(characters):
            break

        first_timed = next(
            (index for index in range(char_start, len(characters)) if index in char_timestamps),
            None,
        )
        if first_timed is None:
            break
        first_content_index = content_index_by_char.get(first_timed, 0)
        remaining_chars = len(content_indices) - first_content_index
        first_timestamp = char_timestamps[first_timed]
        if (
            remaining_chars <= MAX_SUBTITLE_CHARS
            and timestamps[-1][1] - first_timestamp[0] <= MAX_SUBTITLE_DURATION_MS
        ):
            char_end = len(characters)
        else:
            candidates = []
            timed_indices = [
                index for index in range(char_start, len(characters)) if index in char_timestamps
            ]
            for timed_index, char_index in enumerate(timed_indices):
                count = content_index_by_char.get(char_index, first_content_index) - first_content_index + 1
                if count < 8:
                    continue
                if count > MAX_SUBTITLE_CHARS:
                    break

                previous_timestamp = char_timestamps[char_index]
                next_char_index = (
                    timed_indices[timed_index + 1]
                    if timed_index + 1 < len(timed_indices)
                    else len(characters)
                )
                next_timestamp = char_timestamps.get(next_char_index)
                between = characters[char_index + 1 : next_char_index]
                punctuation_boundary = any(
                    character in "，；、,:;" for character in between
                )
                boundary = next_char_index if punctuation_boundary else char_index + 1
                pause_boundary = (
                    next_timestamp is not None
                    and next_timestamp[0] - previous_timestamp[1] >= 220
                )
                elapsed = previous_timestamp[1] - first_timestamp[0]
                if punctuation_boundary or pause_boundary or elapsed >= MAX_SUBTITLE_DURATION_MS:
                    candidates.append(
                        (
                            abs(count - 20),
                            0 if punctuation_boundary else 1,
                            boundary,
                        )
                    )
                if elapsed >= MAX_SUBTITLE_DURATION_MS:
                    break

            if candidates:
                char_end = min(candidates)[2]
            else:
                cut_content_index = min(
                    first_content_index + MAX_SUBTITLE_CHARS, len(content_indices)
                )
                char_end = (
                    content_indices[cut_content_index]
                    if cut_content_index < len(content_indices)
                    else len(characters)
                )

        chunk_text = "".join(characters[char_start:char_end]).strip()
        chunk_timestamps = [
            char_timestamps[index]
            for index in range(char_start, char_end)
            if index in char_timestamps
        ]
        if chunk_text and chunk_timestamps:
            start = chunk_timestamps[0][0]
            end = max(chunk_timestamps[-1][1], start + 300)
            chunks.append(
                {**sentence, "text": chunk_text, "start": start, "end": end}
            )
        char_start = char_end

    return chunks


def merge_short_sentences(sentences: list[dict]) -> list[dict]:
    merged = []
    for sentence in sorted(sentences, key=lambda item: int(item.get("start", 0))):
        text = re.sub(r"\s+", " ", str(sentence.get("text") or "")).strip()
        if not text:
            continue
        current = {**sentence, "text": text}
        if merged:
            previous = merged[-1]
            previous_text = previous["text"].rstrip()
            previous_length = sum(
                not character.isspace() and character not in SUBTITLE_PUNCTUATION
                for character in previous_text
            )
            current_length = sum(
                not character.isspace() and character not in SUBTITLE_PUNCTUATION
                for character in text
            )
            gap = int(current.get("start", 0)) - int(previous.get("end", 0))
            combined_length = previous_length + current_length
            combined_duration = int(current.get("end", 0)) - int(previous.get("start", 0))
            same_speaker = str(current.get("spk", "0")) == str(previous.get("spk", "0"))
            is_short_fragment = previous_length <= 5 or current_length <= 4
            continues_clause = (
                previous_text[-1:] in "，、；,:;" and combined_length <= 28
            )
            if (
                same_speaker
                and -250 <= gap <= MAX_MERGE_GAP_MS
                and combined_length <= MAX_MERGED_CHARS
                and combined_duration <= MAX_MERGED_DURATION_MS
                and (is_short_fragment or continues_clause)
            ):
                previous_content = "".join(
                    character
                    for character in previous_text
                    if not character.isspace()
                    and character not in SUBTITLE_PUNCTUATION
                )
                trailing_punctuation = previous_text[-1:]
                if is_short_fragment and (
                    trailing_punctuation in SENTENCE_END_PUNCTUATION
                    or (
                        trailing_punctuation in CLAUSE_PUNCTUATION
                        and len(previous_content) == 1
                        and previous_content not in SPEECH_FILLERS
                    )
                ):
                    previous_text = previous_text[:-1]
                current_first = text[:1]
                separator = (
                    " "
                    if previous_text[-1:].isascii()
                    and current_first.isascii()
                    and previous_text[-1:].isalnum()
                    and current_first.isalnum()
                    else ""
                )
                previous["text"] = previous_text + separator + text
                previous["end"] = max(
                    int(previous.get("end", 0)), int(current.get("end", 0))
                )
                previous["timestamp"] = [
                    *(previous.get("timestamp") or []),
                    *(current.get("timestamp") or []),
                ]
                continue
        merged.append(current)
    return merged


def parse_corrections(value: str) -> dict[str, str]:
    corrections = {}
    for entry in re.split(r"[,，;\n]+", value):
        for separator in ("=>", "->", "→"):
            if separator in entry:
                wrong, right = (part.strip() for part in entry.split(separator, 1))
                if wrong and right and wrong != right:
                    corrections[wrong] = right
                break
        if len(corrections) == 50:
            break
    return corrections


def normalize_segments(
    result: dict,
    speaker_count: int,
    corrections: dict[str, str] | None = None,
) -> list[dict]:
    speaker_map: dict[str, int] = {}
    segments = []
    sentences = merge_short_sentences(result.get("sentence_info") or [])
    for sentence in sentences:
        for item in split_sentence(sentence):
            text = item["text"].strip()
            if not re.search(r"[0-9A-Za-z\u4e00-\u9fff]", text):
                continue
            raw_speaker = str(item.get("spk", "0"))
            if raw_speaker not in speaker_map:
                speaker_map[raw_speaker] = min(len(speaker_map) + 1, speaker_count)
            speaker = speaker_map[raw_speaker]
            segments.append(
                {
                    "start": int(item["start"]),
                    "end": max(int(item["end"]), int(item["start"]) + 300),
                    "text": text,
                    "speaker": speaker,
                    "speaker_label": f"说话人{speaker}",
                }
            )
    for segment in segments:
        for wrong, right in sorted(
            (corrections or {}).items(), key=lambda item: len(item[0]), reverse=True
        ):
            segment["text"] = segment["text"].replace(wrong, right)
    for previous, current in zip(segments, segments[1:]):
        if current["start"] < previous["end"]:
            boundary = (current["start"] + previous["end"]) // 2
            previous["end"] = max(previous["start"] + 1, boundary)
            current["start"] = min(boundary, current["end"] - 1)
    return segments


def build_srt(segments: list[dict]) -> str:
    lines = []
    for index, segment in enumerate(segments, start=1):
        lines.extend(
            [
                str(index),
                f"{format_srt_time(segment['start'])} --> {format_srt_time(segment['end'])}",
                f"{segment['speaker_label']}：{segment['text']}",
                "",
            ]
        )
    return "\n".join(lines)


def process_video(
    input_path: Path,
    job_dir: Path,
    speaker_count: int,
    corrections: dict[str, str] | None = None,
) -> dict:
    audio_path = job_dir / "audio.wav"
    srt_path = job_dir / "subtitles.srt"
    run_ffmpeg(
        [
            "-i",
            str(input_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(audio_path),
        ]
    )
    with inference_lock:
        result = model.generate(
            input=str(audio_path),
            return_spk_res=speaker_count > 1,
            sentence_timestamp=True,
            preset_spk_num=speaker_count if speaker_count > 1 else None,
            is_final=True,
            cache={},
        )
    raw_result = result[0] if result else {}
    segments = normalize_segments(raw_result, speaker_count, corrections)
    if not segments:
        raise RuntimeError("没有识别到可用语音片段。")
    (job_dir / "segments.json").write_text(
        json.dumps(segments, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    srt_path.write_text(build_srt(segments), encoding="utf-8-sig")
    speakers = sorted({segment["speaker"] for segment in segments})
    source_video_url = f"/api/jobs/{job_dir.name}/source"
    return {
        "segments": segments,
        "text": "\n".join(
            f"{segment['speaker_label']}：{segment['text']}" for segment in segments
        ),
        "speakers": [f"说话人{speaker}" for speaker in speakers],
        "source_video_url": source_video_url,
        "video_url": source_video_url,
        "srt_url": f"/api/jobs/{job_dir.name}/srt",
    }


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model_name: str = Form(default="paraformer", alias="model"),
    response_format: str = Form("json"),
):
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not ready")
    suffix = Path(file.filename or "").suffix or ".audio"
    temp_dir = ROOT / "tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_path = temp_dir / f"{uuid4().hex}{suffix}"
    try:
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Uploaded audio is empty")
        temp_path.write_bytes(data)
        with inference_lock:
            result = model.generate(input=str(temp_path))
        text = result[0].get("text", "") if result else ""
        if response_format == "text":
            return PlainTextResponse(text)
        return {"text": text}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        temp_path.unlink(missing_ok=True)
        await file.close()


@app.post("/api/process-video")
def process_uploaded_video(
    file: UploadFile = File(...),
    speaker_count: int = Form(2),
    corrections: str = Form("", max_length=512),
):
    if model is None:
        raise HTTPException(status_code=503, detail="Model is not ready")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in VIDEO_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail="仅支持常见视频格式：mp4、mov、mkv、avi、webm、m4v",
        )
    job_id = uuid4().hex
    job_dir = JOB_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    input_path = job_dir / f"input{suffix}"
    try:
        speaker_count = max(1, min(2, speaker_count))
        correction_map = parse_corrections(corrections)
        with input_path.open("wb") as output:
            shutil.copyfileobj(file.file, output)
        return {
            "job_id": job_id,
            **process_video(input_path, job_dir, speaker_count, correction_map),
        }
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"视频处理失败：{exc}") from exc
    finally:
        file.file.close()


@app.get("/api/jobs/{job_id}/video")
def get_video(job_id: str):
    path = JOB_DIR / job_id / "video_with_subtitles.mp4"
    if not path.exists():
        raise HTTPException(status_code=404, detail="视频不存在")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename="video_with_subtitles.mp4",
        content_disposition_type="inline",
    )


@app.get("/api/jobs/{job_id}/source")
def get_source_video(job_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(status_code=404, detail="视频不存在")
    job_dir = JOB_DIR / job_id
    input_files = list(job_dir.glob("input.*")) if job_dir.is_dir() else []
    if not input_files or not input_files[0].is_file():
        raise HTTPException(status_code=404, detail="视频不存在")
    path = input_files[0]
    return FileResponse(
        path,
        media_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream",
        filename=path.name,
        content_disposition_type="inline",
    )


@app.get("/api/jobs/{job_id}/result")
def get_job_result(job_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(status_code=404, detail="任务不存在")
    job_dir = JOB_DIR / job_id
    input_files = list(job_dir.glob("input.*")) if job_dir.is_dir() else []
    if not input_files or not input_files[0].is_file():
        raise HTTPException(status_code=404, detail="任务不存在")
    segments = load_job_segments(job_dir)
    speakers = sorted({segment.get("speaker", 1) for segment in segments})
    source_video_url = f"/api/jobs/{job_id}/source"
    return {
        "job_id": job_id,
        "segments": segments,
        "text": "\n".join(
            f"{segment.get('speaker_label', '说话人1')}：{segment['text']}"
            for segment in segments
        ),
        "speakers": [f"说话人{speaker}" for speaker in speakers],
        "source_video_url": source_video_url,
        "video_url": source_video_url,
        "srt_url": f"/api/jobs/{job_id}/srt",
    }


@app.get("/api/jobs/{job_id}/srt")
def get_srt(job_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(status_code=404, detail="字幕不存在")
    path = JOB_DIR / job_id / "subtitles.srt"
    if not path.exists():
        raise HTTPException(status_code=404, detail="字幕不存在")
    return FileResponse(path, media_type="application/x-subrip", filename="subtitles.srt")


@app.post("/api/jobs/{job_id}/clips")
def post_clip(job_id: str, request: ClipRequest):
    try:
        return create_clip(job_id, request)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"剪辑失败：{exc}") from exc


@app.post("/api/jobs/{job_id}/auto-edit/plan")
def post_auto_edit_plan(job_id: str, request: AutoEditPlanRequest):
    try:
        return create_auto_edit_plan(job_id, request)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"自动分析失败：{exc}") from exc


@app.post("/api/jobs/{job_id}/auto-edit/clip")
def post_auto_edit_clip(job_id: str, request: AutoEditClipRequest):
    try:
        return create_auto_edit_clip(job_id, request)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"自动剪辑失败：{exc}") from exc


@app.get("/api/jobs/{job_id}/auto-edit/plan")
def get_auto_edit_plan(job_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise HTTPException(status_code=404, detail="自动剪辑方案不存在")
    path = JOB_DIR / job_id / "auto_edit_plan.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="自动剪辑方案不存在")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/jobs/{job_id}/clips/{clip_id}/video")
def get_clip_video(job_id: str, clip_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id) or not re.fullmatch(
        r"[0-9a-f]{32}", clip_id
    ):
        raise HTTPException(status_code=404, detail="剪辑不存在")
    path = JOB_DIR / job_id / "clips" / f"{clip_id}.mp4"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="剪辑不存在")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename="clip.mp4",
        content_disposition_type="inline",
    )


@app.get("/api/jobs/{job_id}/clips/{clip_id}/srt")
def get_clip_srt(job_id: str, clip_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id) or not re.fullmatch(
        r"[0-9a-f]{32}", clip_id
    ):
        raise HTTPException(status_code=404, detail="字幕不存在")
    path = JOB_DIR / job_id / "clips" / f"{clip_id}.srt"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="字幕不存在")
    return FileResponse(
        path,
        media_type="application/x-subrip",
        filename="clip.srt",
    )


if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
