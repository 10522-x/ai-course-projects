const input = document.querySelector("#video-input");
const dropzone = document.querySelector("#dropzone");
const fileLabel = document.querySelector("#file-label");
const fileMeta = document.querySelector("#file-meta");
const processButton = document.querySelector("#process-button");
const speakerCount = document.querySelector("#speaker-count");
const corrections = document.querySelector("#corrections");
const progressArea = document.querySelector("#progress-area");
const progressLabel = document.querySelector("#progress-label");
const progressValue = document.querySelector("#progress-value");
const progressBar = document.querySelector("#progress-bar");
const healthLabel = document.querySelector("#health-label");
const statusDot = document.querySelector("#status-dot");
const emptyState = document.querySelector("#empty-state");
const resultVideo = document.querySelector("#result-video");
const resultActions = document.querySelector("#result-actions");
const srtLink = document.querySelector("#srt-link");
const transcript = document.querySelector("#transcript");
const segmentCount = document.querySelector("#segment-count");

let selectedFile = null;
let subtitleTrackUrl = null;

function setProgress(label, percent) {
  progressArea.hidden = false;
  progressLabel.textContent = label;
  progressValue.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
}

function setHealth(ready, message) {
  statusDot.classList.toggle("ready", ready);
  statusDot.classList.toggle("error", !ready);
  healthLabel.textContent = message;
}

function setSelectedFile(file) {
  selectedFile = file;
  fileLabel.textContent = file.name;
  fileMeta.textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  fileMeta.hidden = false;
  processButton.disabled = false;
}

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderTranscript(segments) {
  segmentCount.textContent = `${segments.length} 段`;
  segmentCount.hidden = false;
  transcript.innerHTML = "";
  segments.forEach((segment) => {
    const row = document.createElement("div");
    row.className = "transcript-row";
    row.innerHTML = `
      <span class="speaker-tag speaker-${segment.speaker}">${segment.speaker_label}</span>
      <div class="transcript-text">
        <div>${escapeHtml(segment.text)}</div>
        <div class="transcript-time">${formatTime(segment.start)} - ${formatTime(segment.end)}</div>
      </div>
    `;
    transcript.appendChild(row);
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character]));
}

function formatVttTime(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function escapeVttText(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clearVideoPreview() {
  resultVideo.pause();
  resultVideo.querySelectorAll("track").forEach((track) => track.remove());
  resultVideo.removeAttribute("src");
  resultVideo.load();
  if (subtitleTrackUrl) URL.revokeObjectURL(subtitleTrackUrl);
  subtitleTrackUrl = null;
  resultVideo.hidden = true;
  emptyState.hidden = false;
}

function showVideoPreview(videoUrl, segments) {
  const cues = segments.map((segment, index) => [
    String(index + 1),
    `${formatVttTime(segment.start)} --> ${formatVttTime(segment.end)}`,
    escapeVttText(`${segment.speaker_label}：${segment.text}`),
  ].join("\n"));
  const vtt = `WEBVTT\n\n${cues.join("\n\n")}\n`;
  const track = document.createElement("track");
  track.kind = "captions";
  track.label = "中文";
  track.srclang = "zh-CN";
  track.default = true;
  subtitleTrackUrl = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
  track.src = subtitleTrackUrl;
  resultVideo.replaceChildren(track);
  resultVideo.src = videoUrl;
  resultVideo.hidden = false;
  emptyState.hidden = true;
  resultVideo.load();
  track.track.mode = "showing";
}

async function checkHealth() {
  try {
    const response = await fetch("/health");
    if (!response.ok) throw new Error("服务未就绪");
    const data = await response.json();
    setHealth(data.status === "ok", data.status === "ok" ? "已就绪" : "加载中");
  } catch {
    setHealth(false, "未连接");
  }
}

input.addEventListener("change", () => {
  if (input.files?.[0]) setSelectedFile(input.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
});

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files?.[0];
  if (file) setSelectedFile(file);
});

processButton.addEventListener("click", async () => {
  if (!selectedFile) return;
  processButton.disabled = true;
  speakerCount.disabled = true;
  resultActions.hidden = true;
  clearVideoPreview();
  segmentCount.hidden = true;
  transcript.innerHTML = '<div class="transcript-empty">正在识别...</div>';
  setProgress("正在上传视频", 15);

  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("speaker_count", speakerCount.value);
  formData.append("corrections", corrections.value);

  try {
    setProgress("识别中", 35);
    const response = await fetch("/api/process-video", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "视频处理失败");
    if (!Array.isArray(data.segments) || !(data.source_video_url || data.video_url) || !data.srt_url) {
      throw new Error("服务返回的数据不完整。");
    }

    setProgress("生成中", 85);
    showVideoPreview(data.source_video_url || data.video_url, data.segments);
    srtLink.href = data.srt_url;
    resultActions.hidden = false;
    renderTranscript(data.segments);
    setProgress("处理完成", 100);
  } catch (error) {
    transcript.innerHTML = `<div class="transcript-empty">${escapeHtml(error.message)}</div>`;
    setProgress("处理失败", 0);
  } finally {
    processButton.disabled = false;
    speakerCount.disabled = false;
  }
});

checkHealth();
