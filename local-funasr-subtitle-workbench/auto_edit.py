import math
import re
import struct
import wave
from collections.abc import Iterable
from pathlib import Path


AUTO_EDIT_RULES_VERSION = "2026-11-01.v3"
DEFAULT_SILENCE_THRESHOLD_DB = -42.0
DEFAULT_MIN_SILENCE_MS = 260
DEFAULT_MAX_KEEP_PAUSE_MS = 350
DEFAULT_HEAD_MS = 160
DEFAULT_TAIL_MS = 190

FILLER_WORDS = {
    "嗯",
    "啊",
    "哦",
    "唉",
    "诶",
    "哎",
    "呃",
    "喔",
    "欸",
    "对",
    "好",
    "是",
    "嗯嗯",
    "啊啊",
}

QUESTION_MARKERS = (
    "吗",
    "什么",
    "怎么",
    "为什么",
    "哪里",
    "哪个",
    "哪一个",
    "是不是",
    "对不对",
    "啥",
    "咋",
    "哪儿",
)

EMOTION_MARKERS = (
    "这么快",
    "好快",
    "太快",
    "就这",
    "真的假的",
    "不会吧",
    "好厉害",
    "厉害",
    "天哪",
    "我的天",
    "哈哈",
    "笑死",
    "吓",
    "哇",
)

INFORMATION_MARKERS = (
    "点击",
    "选择",
    "输入",
    "打开",
    "运行",
    "设置",
    "调整",
    "安装",
    "部署",
    "下载",
    "保存",
    "上传",
    "导入",
    "导出",
    "使用",
    "步骤",
    "参数",
    "关键词",
    "模型",
    "字幕",
    "本地",
    "页面",
    "提示词",
    "输入框",
    "链接",
    "电脑",
    "CPU",
)

OPERATION_MARKERS = (
    "点击",
    "选择",
    "输入",
    "打开",
    "运行",
    "设置",
    "调整",
    "安装",
    "部署",
    "下载",
    "保存",
    "上传",
    "导入",
    "导出",
    "步骤",
    "参数",
    "关键词",
    "提示词",
    "输入框",
    "链接",
)

THEORY_MARKERS = (
    "模型原理",
    "原理介绍",
    "工作原理",
    "网络结构",
    "架构介绍",
)

REPAIR_MARKERS = (
    "不准",
    "错误",
    "不对",
    "重新",
    "应该",
    "修正",
    "纠正",
    "翻车",
    "按错",
    "做错",
    "错了",
    "出错",
)

BRIDGE_MARKERS = (
    "你看",
    "现在",
    "我们刚才",
    "首先",
    "然后",
    "所以",
    "其实",
    "就是",
    "这个",
    "那",
)


def _plain_text(value: str) -> str:
    return re.sub(r"[\s，。！？、；：,.?!:;…]+", "", str(value or ""))


def _contains_any(text: str, markers: Iterable[str]) -> bool:
    return any(marker in text for marker in markers)


def _is_question(text: str) -> bool:
    return text.endswith(("？", "?")) or _contains_any(text, QUESTION_MARKERS)


def _is_emotion(text: str) -> bool:
    plain = _plain_text(text)
    if not plain:
        return False
    return _contains_any(plain, EMOTION_MARKERS) or (
        len(plain) <= 8 and any(mark in plain for mark in ("啊", "呀", "哇"))
    )


def _is_pure_filler(text: str) -> bool:
    plain = _plain_text(text)
    if not plain or len(plain) > 8:
        return False
    words = re.findall(r"[\u4e00-\u9fff]+", plain)
    return bool(words) and all(word in FILLER_WORDS for word in words)


def _speaker_role(speaker: int, male_speaker: int, female_speaker: int) -> str:
    if speaker == male_speaker:
        return "male"
    if speaker == female_speaker:
        return "female"
    return "unknown"


def _classify_segment(
    segment: dict,
    male_speaker: int,
    female_speaker: int,
) -> dict:
    text = str(segment.get("text") or "").strip()
    plain = _plain_text(text)
    speaker = int(segment.get("speaker", 1))
    role = _speaker_role(speaker, male_speaker, female_speaker)
    category = "unknown"
    action = "review"
    reasons: list[str] = []
    confidence = "low"

    if not plain:
        category = "filler"
        action = "drop"
        confidence = "high"
        reasons.append("没有可保留的文字")
    elif _is_question(text):
        category = "question"
        action = "keep"
        confidence = "high" if role == "female" else "medium"
        reasons.append(
            "女生提问，保留观众疑问"
            if role == "female"
            else "疑问句可能是观众问题，避免受说话人误分影响"
        )
    elif _is_emotion(text):
        category = "emotion"
        action = "keep"
        confidence = "high" if role == "female" else "medium"
        reasons.append(
            "女生真实反应或情绪点"
            if role == "female"
            else "情绪反应，避免受说话人误分影响"
        )
    elif _is_pure_filler(text):
        category = "filler"
        action = "drop"
        confidence = "high"
        reasons.append("只有填充词或简短应答")
    elif _contains_any(plain, REPAIR_MARKERS):
        category = "repair"
        action = "keep"
        confidence = "medium"
        reasons.append("包含出错、纠正或因果线索")
    elif (
        role == "male"
        and _contains_any(plain, THEORY_MARKERS)
        and not _contains_any(plain, OPERATION_MARKERS + ("怎么", "教程", "操作"))
    ):
        category = "theory"
        action = "drop"
        confidence = "medium"
        reasons.append("男生原理铺垫，优先压缩")
    elif _contains_any(plain, INFORMATION_MARKERS):
        category = "information"
        action = "keep"
        confidence = "medium"
        reasons.append("包含操作、参数或结果信息")
    elif _contains_any(plain, BRIDGE_MARKERS) and len(plain) <= 12:
        category = "bridge"
        action = "review"
        confidence = "medium"
        reasons.append("可能是铺垫或连接句")
    elif role == "male" and len(plain) <= 5:
        category = "bridge"
        action = "drop"
        confidence = "low"
        reasons.append("男生短连接句，暂按无独立信息处理")
    else:
        category = "information" if len(plain) >= 9 else "unknown"
        action = "keep" if category == "information" else "review"
        confidence = "low" if action == "review" else "medium"
        reasons.append(
            "句子较完整，暂时保留"
            if action == "keep"
            else "规则无法确认价值，交给人工复核"
        )

    return {
        **segment,
        "role": role,
        "category": category,
        "action": action,
        "confidence": confidence,
        "reasons": reasons,
        "protected": False,
        "group_id": None,
    }


def _merge_groups(groups: list[set[int]]) -> list[set[int]]:
    merged: list[set[int]] = []
    for group in groups:
        overlapping = [item for item in merged if item & group]
        if not overlapping:
            merged.append(set(group))
            continue
        combined = set(group)
        for item in overlapping:
            combined.update(item)
            merged.remove(item)
        merged.append(combined)
    return sorted(merged, key=lambda item: min(item))


def _mark_repeated_segments(planned: list[dict]) -> None:
    recent_by_speaker: dict[int, list[tuple[int, str]]] = {}
    for index, item in enumerate(planned):
        text = _plain_text(item["text"])
        speaker = int(item.get("speaker", 1))
        start = int(item.get("start", 0))
        recent = recent_by_speaker.setdefault(speaker, [])
        repeated = any(
            text
            and text == previous_text
            and start - previous_start <= 20_000
            for previous_start, previous_text in recent[-8:]
        )
        if repeated and item["action"] in {"keep", "review"}:
            item["category"] = "repetition"
            item["action"] = "drop"
            item["confidence"] = "medium"
            item["reasons"].append("与前面的同一说话人内容重复")
        recent.append((start, text))


def detect_silence_spans(
    audio_path: str | Path,
    threshold_db: float = DEFAULT_SILENCE_THRESHOLD_DB,
    min_silence_ms: int = DEFAULT_MIN_SILENCE_MS,
    frame_ms: int = 10,
) -> list[dict]:
    path = Path(audio_path)
    if not path.is_file():
        return []
    try:
        source = wave.open(str(path), "rb")
    except (OSError, wave.Error):
        return []

    with source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        sample_rate = source.getframerate()
        if sample_width != 2 or sample_rate <= 0:
            return []
        frames_per_chunk = max(1, round(sample_rate * frame_ms / 1000))
        bytes_per_frame = channels * sample_width
        silent_start: int | None = None
        spans: list[dict] = []
        position_ms = 0

        while True:
            raw = source.readframes(frames_per_chunk)
            if not raw:
                break
            sample_count = len(raw) // 2
            samples = struct.unpack(f"<{sample_count}h", raw)
            rms = math.sqrt(sum(sample * sample for sample in samples) / sample_count)
            level_db = 20 * math.log10(max(rms, 1) / 32768)
            chunk_duration_ms = round(len(raw) / bytes_per_frame / sample_rate * 1000)
            is_silent = level_db < threshold_db
            if is_silent and silent_start is None:
                silent_start = position_ms
            elif not is_silent and silent_start is not None:
                end_ms = position_ms
                if end_ms - silent_start >= min_silence_ms:
                    spans.append(
                        {
                            "start": silent_start,
                            "end": end_ms,
                            "duration_ms": end_ms - silent_start,
                        }
                    )
                silent_start = None
            position_ms += chunk_duration_ms

        if silent_start is not None and position_ms - silent_start >= min_silence_ms:
            spans.append(
                {
                    "start": silent_start,
                    "end": position_ms,
                    "duration_ms": position_ms - silent_start,
                }
            )
    return spans


def _silence_coverage(
    start: int,
    end: int,
    silence_spans: list[dict],
) -> float:
    if end <= start:
        return 0.0
    covered = 0
    for span in silence_spans:
        covered += max(0, min(end, int(span["end"])) - max(start, int(span["start"])))
    return min(1.0, covered / (end - start))


def build_auto_clip_ranges(
    segments: list[dict],
    selected_indices: list[int],
    duration_ms: int,
    silence_spans: list[dict] | None = None,
    head_ms: int = DEFAULT_HEAD_MS,
    tail_ms: int = DEFAULT_TAIL_MS,
    max_keep_pause_ms: int = DEFAULT_MAX_KEEP_PAUSE_MS,
) -> list[dict]:
    if duration_ms <= 0:
        return []
    silence_spans = silence_spans or []
    ranges: list[dict] = []
    for index in sorted(set(selected_indices)):
        segment = segments[index]
        start = max(0, int(segment.get("start", 0)))
        end = min(duration_ms, max(start + 1, int(segment.get("end", start + 1))))
        expanded_start = max(0, start - head_ms)
        expanded_end = min(duration_ms, end + tail_ms)
        if not ranges:
            ranges.append(
                {
                    "start": expanded_start,
                    "end": expanded_end,
                    "segment_indices": [index],
                    "removed_pause_ms": 0,
                }
            )
            continue

        previous = ranges[-1]
        previous_segment = segments[previous["segment_indices"][-1]]
        gap_start = int(previous_segment.get("end", previous["end"]))
        gap_end = start
        gap_ms = max(0, gap_end - gap_start)
        coverage = _silence_coverage(gap_start, gap_end, silence_spans)
        can_cut = gap_ms > max_keep_pause_ms and (
            coverage >= 0.55 or gap_ms >= 1_200
        )
        if can_cut:
            previous["removed_pause_ms"] += max(0, gap_ms - head_ms - tail_ms)
            ranges.append(
                {
                    "start": expanded_start,
                    "end": expanded_end,
                    "segment_indices": [index],
                    "removed_pause_ms": 0,
                    "silence_coverage": round(coverage, 3),
                }
            )
        else:
            previous["end"] = max(previous["end"], expanded_end)
            previous["segment_indices"].append(index)
    return ranges


def build_auto_edit_plan(
    segments: list[dict],
    male_speaker: int = 1,
    female_speaker: int = 2,
    audio_path: str | Path | None = None,
    duration_ms: int | None = None,
    head_ms: int = DEFAULT_HEAD_MS,
    tail_ms: int = DEFAULT_TAIL_MS,
    max_keep_pause_ms: int = DEFAULT_MAX_KEEP_PAUSE_MS,
) -> dict:
    if male_speaker == female_speaker:
        raise ValueError("男生和女生不能映射到同一个说话人")

    planned = [
        _classify_segment(segment, male_speaker, female_speaker)
        for segment in segments
    ]
    _mark_repeated_segments(planned)
    groups: list[set[int]] = []

    for index, item in enumerate(planned):
        if item["role"] == "female" and item["category"] == "question":
            end = min(len(planned) - 1, index + 3)
            groups.append(set(range(index, end + 1)))
        if item["category"] == "repair":
            start = max(0, index - 2)
            end = min(len(planned) - 1, index + 3)
            groups.append(set(range(start, end + 1)))

    protected_groups = []
    for group_index, group in enumerate(_merge_groups(groups), start=1):
        group_type = (
            "问答"
            if any(planned[index]["category"] == "question" for index in group)
            else "翻车纠正"
        )
        group_id = f"g{group_index}"
        indices = sorted(group)
        for index in indices:
            item = planned[index]
            item["protected"] = True
            item["group_id"] = group_id
            if item["action"] == "drop":
                item["action"] = "review"
                item["reasons"].append("连续情节保护，不自动删除")
        protected_groups.append(
            {
                "id": group_id,
                "type": group_type,
                "indices": indices,
                "start": int(planned[indices[0]].get("start", 0)),
                "end": int(planned[indices[-1]].get("end", 0)),
                "reason": (
                    "保留女生提问及其后续回答"
                    if group_type == "问答"
                    else "保留出错、指出问题和修正结果的连续过程"
                ),
            }
        )

    keep_indices = [
        index for index, item in enumerate(planned) if item["action"] == "keep"
    ]
    review_indices = [
        index for index, item in enumerate(planned) if item["action"] == "review"
    ]
    drop_indices = [
        index for index, item in enumerate(planned) if item["action"] == "drop"
    ]
    silence_spans = (
        detect_silence_spans(audio_path)
        if audio_path is not None
        else []
    )
    selected_indices = sorted(keep_indices + review_indices)
    clip_ranges = []
    if duration_ms is not None:
        clip_ranges = build_auto_clip_ranges(
            segments,
            selected_indices,
            duration_ms,
            silence_spans=silence_spans,
            head_ms=head_ms,
            tail_ms=tail_ms,
            max_keep_pause_ms=max_keep_pause_ms,
        )
    long_silences = [
        span for span in silence_spans if int(span["duration_ms"]) >= 600
    ]
    counts = {
        "keep": len(keep_indices),
        "review": len(review_indices),
        "drop": len(drop_indices),
        "protected": sum(item["protected"] for item in planned),
        "clip_ranges": len(clip_ranges),
    }
    return {
        "rules_version": AUTO_EDIT_RULES_VERSION,
        "segments": planned,
        "suggested_indices": selected_indices,
        "keep_indices": keep_indices,
        "review_indices": review_indices,
        "drop_indices": drop_indices,
        "protected_groups": protected_groups,
        "clip_ranges": clip_ranges,
        "silence": {
            "threshold_db": DEFAULT_SILENCE_THRESHOLD_DB,
            "min_silence_ms": DEFAULT_MIN_SILENCE_MS,
            "detected_count": len(silence_spans),
            "long_count": len(long_silences),
            "total_ms": sum(int(span["duration_ms"]) for span in silence_spans),
            "long_spans": long_silences[:200],
        },
        "summary": counts,
        "roles": {
            "male_speaker": male_speaker,
            "female_speaker": female_speaker,
            "male_label": f"说话人{male_speaker}",
            "female_label": f"说话人{female_speaker}",
        },
    }
