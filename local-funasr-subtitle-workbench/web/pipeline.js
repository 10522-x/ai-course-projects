const units = [
  { id: "input", title: "视频输入", model: "视频文件", icon: "film", kind: "media", description: "接收视频，保留原始画面与音轨，作为整条流水线的素材。", input: "MP4 / MOV / MKV 等视频", output: "原始视频与音轨" },
  { id: "audio", title: "音频提取", model: "FFmpeg", icon: "audio-lines", kind: "media", description: "将视频音轨转换为模型需要的音频格式，视频画面保持原样用于预览。", input: "视频音轨", output: "16 kHz · 单声道 WAV" },
  { id: "vad", title: "语音检测", model: "FSMN-VAD", icon: "scan-line", kind: "model", description: "找出什么时候有人说话，切出有效语音区间，供文字识别和声纹提取使用。", input: "标准化音频", output: "语音片段与起止时间" },
  { id: "asr", title: "语音识别", model: "Paraformer-large", icon: "speech", kind: "model", description: "把中文语音识别成文字，并返回字词时间戳。它不负责判断说话人是谁。", input: "有效语音片段", output: "识别文字与时间戳" },
  { id: "punc", title: "标点恢复", model: "CT-Punc", icon: "text-cursor-input", kind: "model", description: "为识别文字补上标点，形成句子边界，供后续字幕编排使用。", input: "识别文字", output: "带标点的句子" },
  { id: "speaker", title: "说话人区分", model: "CAM++ · 聚类", icon: "users-round", kind: "model", description: "CAM++ 提取声纹特征，聚类后分配两组说话人标签。标签不是真实身份，也不分离重叠人声。", input: "语音片段", output: "说话人分组与时间区间" },
  { id: "subtitle", title: "字幕生成", model: "时间轴 · SRT", icon: "captions", kind: "process", description: "汇合文字、时间戳与说话人标签，整理字幕长度和时间重叠，生成 SRT。", input: "句子 + 时间戳 + 说话人标签", output: "SRT 字幕" },
  { id: "preview", title: "字幕预览", model: "原视频 · WebVTT", icon: "monitor-play", kind: "media", description: "在原视频播放器上叠加同步字幕，检查识别效果，不重新编码视频。", input: "原始视频 + 字幕时间轴", output: "视频预览 · SRT 下载" },
];

const $ = (selector) => document.querySelector(selector);
const viewport = $("#scene-viewport");
const sizer = $("#scene-sizer");
const world = $("#scene-world");
const nodes = $("#nodes");
const svg = $("#connections");
const nodeStates = new Map(units.map((unit) => [unit.id, "idle"]));
const stateLabels = { idle: "待运行", ready: "已选择", pending: "未开始", running: "处理中", waiting: "等待返回", simulated: "估算完成", done: "已完成", error: "处理失败" };
const stageDurations = [0, 650, 800, 1450, 650, 1000, 800, 600];
const allowedSuffixes = /\.(mp4|mov|mkv|avi|webm|m4v)$/i;
let selectedUnit = "vad";
let selectedFile = null;
let busy = false;
let ready = false;
let zoom = 1;
let isMobile = false;
let worldWidth = 950;
let worldHeight = 550;
let requestStarted = 0;
let elapsedTimer = null;
let request = null;
let lastViewportWidth = 0;
let runToken = 0;
let simulationStarted = false;
let simulationComplete = false;
let serverResult = null;
let finalizing = false;
let subtitleTrackUrl = null;
let selectedSegments = new Set();
let clipBusy = false;
let autoEditBusy = false;
let autoEditPlan = null;

const autoActionLabels = {
  keep: "保留",
  review: "待确认",
  drop: "删除候选",
};

function icons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.6 } });
}

function renderUnits() {
  for (const [index, unit] of units.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-node";
    button.id = `node-${unit.id}`;
    button.dataset.kind = unit.kind;
    button.dataset.state = "idle";
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span class="node-heading"><i data-lucide="${unit.icon}" aria-hidden="true"></i><strong>${unit.title}</strong></span><span class="node-model">${unit.model}</span><span class="node-bottom"><span class="node-state">待运行</span><span class="node-number">${String(index + 1).padStart(2, "0")}</span></span><span class="node-progress-track" aria-hidden="true"><span class="node-progress-fill"></span></span>`;
    button.addEventListener("click", () => selectUnit(unit.id));
    nodes.appendChild(button);
  }
  icons();
  selectUnit(selectedUnit);
}

function selectUnit(id) {
  selectedUnit = id;
  const unit = units.find((item) => item.id === id);
  for (const item of units) {
    const selected = item.id === id;
    $(`#node-${item.id}`).classList.toggle("selected", selected);
    $(`#node-${item.id}`).setAttribute("aria-pressed", String(selected));
  }
  $("#unit-position").textContent = `${String(units.indexOf(unit) + 1).padStart(2, "0")} / ${String(units.length).padStart(2, "0")}`;
  $("#unit-title").textContent = unit.title;
  $("#unit-model").textContent = unit.model;
  $("#unit-description").textContent = unit.description;
  $("#unit-input").textContent = unit.input;
  $("#unit-output").textContent = unit.output;
  $("#unit-state").textContent = stateLabels[nodeStates.get(id)];
  $("#inspector-icon").innerHTML = `<i data-lucide="${unit.icon}" aria-hidden="true"></i>`;
  icons();
}

function setNodeState(id, state, progress = 0) {
  nodeStates.set(id, state);
  const node = $(`#node-${id}`);
  node.dataset.state = state;
  node.querySelector(".node-state").textContent = state === "running"
    ? `${stateLabels[state]} ${progress}%`
    : stateLabels[state];
  node.querySelector(".node-progress-fill").style.width = `${progress}%`;
  node.setAttribute("aria-label", `${units.find((unit) => unit.id === id).title}: ${stateLabels[state]}${state === "running" ? ` ${progress}%` : ""}`);
  if (selectedUnit === id) $("#unit-state").textContent = stateLabels[state];
}

function svgElement(tag, attrs) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

function drawGraph() {
  if (viewport.clientWidth === lastViewportWidth) return;
  lastViewportWidth = viewport.clientWidth;
  isMobile = viewport.clientWidth < 600;
  viewport.classList.toggle("compact", isMobile);
  worldWidth = isMobile ? Math.max(308, Math.min(382, viewport.clientWidth - 12)) : 950;
  worldHeight = isMobile ? 710 : 550;
  const nodeWidth = isMobile ? (worldWidth - 62) / 2 : 174;
  const left = 16;
  const right = worldWidth - 16 - nodeWidth;
  const leftCenter = left + nodeWidth / 2;
  const rightCenter = right + nodeWidth / 2;
  const positions = isMobile
    ? { input: [left, 26], audio: [right, 26], vad: [right, 166], asr: [right, 306], punc: [right, 446], speaker: [left, 306], subtitle: [left, 446], preview: [right, 586] }
    : { input: [32, 52], audio: [266, 52], vad: [500, 52], asr: [734, 52], punc: [734, 234], speaker: [500, 234], subtitle: [734, 416], preview: [266, 416] };
  for (const unit of units) {
    const node = $(`#node-${unit.id}`);
    node.style.width = `${nodeWidth}px`;
    node.style.left = `${positions[unit.id][0]}px`;
    node.style.top = `${positions[unit.id][1]}px`;
  }
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${worldWidth} ${worldHeight}`);
  svg.style.width = `${worldWidth}px`;
  svg.style.height = `${worldHeight}px`;
  const defs = svgElement("defs", {});
  const marker = svgElement("marker", { id: "flow-arrow", markerWidth: 7, markerHeight: 7, refX: 6, refY: 3.5, orient: "auto", markerUnits: "userSpaceOnUse" });
  marker.appendChild(svgElement("path", { d: "M 1 1 L 5 3.5 L 1 6", fill: "none", stroke: "#a1a1ad", "stroke-width": 1.1 }));
  defs.appendChild(marker);
  svg.appendChild(defs);
  const routes = isMobile
    ? [
      [`M${left + nodeWidth} 73 H${right - 6}`, "", 0, 0],
      [`M${rightCenter} 120 V160`, "", 0, 0],
      [`M${rightCenter} 260 V300`, "", 0, 0],
      [`M${right} 213 H${leftCenter} V300`, "语音", leftCenter + 10, 203],
      [`M${rightCenter} 400 V440`, "文字", rightCenter + 8, 424],
      [`M${right} 493 H${left + nodeWidth + 6}`, "", 0, 0],
      [`M${leftCenter} 400 V440`, "声纹", leftCenter + 8, 424],
      [`M${left + nodeWidth} 493 H${rightCenter} V580`, "", 0, 0],
      [`M16 73 H5 V633 H${right - 6}`, "", 0, 0, "media-bypass"],
    ]
    : [
      ["M206 99 H260", "", 0, 0],
      ["M440 99 H494", "", 0, 0],
      ["M674 99 H728", "", 0, 0],
      ["M587 146 V228", "语音", 598, 192],
      ["M821 146 V228", "文字", 832, 192],
      ["M821 328 V410", "句子", 832, 375],
      ["M674 281 H704 V371 H778 V410", "声纹", 714, 360],
      ["M734 463 H446", "", 0, 0],
      ["M119 146 V532 H353 V410", "原始画面", 140, 520, "media-bypass"],
    ];
  for (const [path, label, x, y, extraClass = ""] of routes) {
    svg.appendChild(svgElement("path", { d: path, class: `flow-edge ${extraClass}`, "marker-end": "url(#flow-arrow)" }));
    if (label) {
      const text = svgElement("text", { x, y, class: "edge-label" });
      text.textContent = label;
      svg.appendChild(text);
    }
  }
  fitScene();
}

function applyZoom() {
  world.style.width = `${worldWidth}px`;
  world.style.height = `${worldHeight}px`;
  world.style.transform = `scale(${zoom})`;
  sizer.style.width = `${worldWidth * zoom}px`;
  sizer.style.height = `${worldHeight * zoom}px`;
  viewport.style.height = isMobile ? `${Math.min(740, worldHeight * zoom + 24)}px` : "";
  $("#zoom-value").textContent = `${Math.round(zoom * 100)}%`;
}

function fitScene() {
  zoom = Math.min(1, (viewport.clientWidth - 12) / worldWidth);
  applyZoom();
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;
}

function showError(selector, message) {
  $(selector).hidden = !message;
  $(selector).textContent = message || "";
}

function selectFile(file) {
  if (busy || clipBusy) return;
  if (!allowedSuffixes.test(file.name)) {
    showError("#upload-error", "请选择 MP4、MOV、MKV、AVI、WebM 或 M4V 视频。");
    return;
  }
  showError("#upload-error", "");
  showError("#process-error", "");
  selectedFile = file;
  $("#file-name").textContent = file.name;
  $("#file-size").textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
  $("#file-size").hidden = false;
  $("#run-button").disabled = !ready;
  for (const unit of units) setNodeState(unit.id, unit.id === "input" ? "ready" : "idle");
  $("#task-status").textContent = "待运行";
  $("#task-status").className = "task-status";
  $("#runtime-message").textContent = `${units.length} 个单元`;
  clearResult();
}

function clearResult() {
  serverResult = null;
  autoEditPlan = null;
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has("job_id")) {
    currentUrl.searchParams.delete("job_id");
    window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
  }
  $("#downloads").hidden = true;
  $("#clip-toolbar").hidden = true;
  $("#clip-output").hidden = true;
  $("#clip-video").pause();
  $("#clip-video").removeAttribute("src");
  $("#clip-video").load();
  $("#download-clip").removeAttribute("href");
  $("#download-clip-srt").removeAttribute("href");
  $("#auto-edit-summary").textContent = "";
  $("#auto-edit").disabled = true;
  $("#auto-edit span").textContent = "自动分析";
  $("#auto-edit-render").disabled = true;
  $("#auto-edit-render span").textContent = "自动剪辑";
  showError("#clip-error", "");
  $("#output-video").pause();
  $("#output-video").querySelectorAll("track").forEach((track) => track.remove());
  $("#output-video").removeAttribute("src");
  $("#output-video").load();
  if (subtitleTrackUrl) URL.revokeObjectURL(subtitleTrackUrl);
  subtitleTrackUrl = null;
  $("#output-video").hidden = true;
  $("#video-placeholder").hidden = false;
  $("#result-count").hidden = true;
  $("#transcript-output").replaceChildren();
  selectedSegments.clear();
  $("#selected-count").textContent = "已选 0";
  $("#make-clip").disabled = true;
  const empty = document.createElement("p");
  empty.className = "transcript-placeholder";
  empty.textContent = "暂无字幕";
  $("#transcript-output").appendChild(empty);
}

function resetProgress() {
  runToken += 1;
  clearInterval(elapsedTimer);
  simulationStarted = false;
  simulationComplete = false;
  finalizing = false;
  serverResult = null;
  for (const unit of units) setNodeState(unit.id, "idle");
}

async function checkHealth() {
  try {
    const response = await fetch("/health");
    if (!response.ok) throw new Error("服务未连接");
    const data = await response.json();
    ready = data.status === "ok";
    $("#connection").textContent = ready ? "本地已就绪" : "模型加载中";
    $("#connection").className = ready ? "connection ready" : "connection";
    $("#engine-label").textContent = `本地 · ${String(data.device || "cpu").toUpperCase()}`;
  } catch {
    ready = false;
    $("#connection").textContent = "服务未连接";
    $("#connection").className = "connection error";
  }
  $("#run-button").disabled = busy || clipBusy || !ready || !selectedFile;
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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

function renderResult(data) {
  const video = $("#output-video");
  const cues = data.segments.map((segment, index) => [
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
  video.replaceChildren(track);
  video.src = data.source_video_url || data.video_url;
  $("#output-video").hidden = false;
  $("#video-placeholder").hidden = true;
  video.load();
  track.track.mode = "showing";
  $("#download-srt").href = data.srt_url;
  $("#downloads").hidden = false;
  $("#result-count").textContent = `${data.segments.length} 段字幕`;
  $("#result-count").hidden = false;
  const transcript = $("#transcript-output");
  transcript.replaceChildren();
  selectedSegments.clear();
  $("#clip-toolbar").hidden = false;
  for (const [index, segment] of data.segments.entries()) {
    const row = document.createElement("div");
    row.className = "caption-row";
    const checkbox = document.createElement("input");
    checkbox.className = "caption-select";
    checkbox.type = "checkbox";
    checkbox.setAttribute(
      "aria-label",
      `选择 ${segment.speaker_label} ${formatTime(segment.start)} ${segment.text}`,
    );
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedSegments.add(index);
      else selectedSegments.delete(index);
      row.classList.toggle("selected", checkbox.checked);
      updateClipSelection();
    });
    const time = document.createElement("span");
    time.className = "caption-time";
    time.textContent = formatTime(segment.start);
    const speaker = document.createElement("span");
    speaker.className = `caption-speaker speaker-${Number(segment.speaker)}`;
    speaker.textContent = segment.speaker_label;
    const text = document.createElement("span");
    text.className = "caption-text";
    text.textContent = segment.text;
    const decision = document.createElement("span");
    decision.className = "caption-decision";
    decision.hidden = true;
    row.append(checkbox, time, speaker, decision, text);
    transcript.appendChild(row);
  }
  $("#auto-edit").disabled = false;
  $("#auto-edit-render").disabled = false;
  updateClipSelection();
}

function updateClipSelection() {
  $("#selected-count").textContent = `已选 ${selectedSegments.size}`;
  $("#make-clip").disabled = clipBusy || !serverResult || selectedSegments.size === 0;
  $("#auto-edit-render").disabled = clipBusy || !serverResult;
}

function applyAutoEditPlan(plan) {
  autoEditPlan = plan;
  selectedSegments = new Set(plan.suggested_indices || []);
  const summary = plan.summary || {};
  const silence = plan.silence || {};
  $("#auto-edit-summary").textContent =
    `保留 ${summary.keep || 0} · 待确认 ${summary.review || 0} · 删除 ${summary.drop || 0} · 空白 ${silence.long_count || 0}`;
  for (const [index, row] of [...$("#transcript-output").children].entries()) {
    const item = plan.segments?.[index];
    if (!item) continue;
    const decision = row.querySelector(".caption-decision");
    const checkbox = row.querySelector(".caption-select");
    decision.hidden = false;
    decision.textContent = autoActionLabels[item.action] || item.action;
    decision.dataset.action = item.action;
    decision.title = (item.reasons || []).join("；");
    row.dataset.autoAction = item.action;
    row.classList.toggle("auto-protected", Boolean(item.protected));
    checkbox.checked = selectedSegments.has(index);
    row.classList.toggle("selected", checkbox.checked);
  }
  updateClipSelection();
}

async function analyzeAutoEdit() {
  if (!serverResult?.job_id || autoEditBusy || clipBusy) return null;
  const maleSpeaker = Number($("#male-speaker").value);
  const femaleSpeaker = Number($("#female-speaker").value);
  if (maleSpeaker === femaleSpeaker) {
    showError("#clip-error", "男生和女生需要映射到不同的说话人。");
    return;
  }

  autoEditBusy = true;
  showError("#clip-error", "");
  $("#auto-edit").disabled = true;
  $("#auto-edit span").textContent = "分析中";
  $("#male-speaker").disabled = true;
  $("#female-speaker").disabled = true;
  try {
    const response = await fetch(`/api/jobs/${serverResult.job_id}/auto-edit/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        male_speaker: maleSpeaker,
        female_speaker: femaleSpeaker,
        head_ms: Math.round(Number($("#clip-head").value) * 1000),
        tail_ms: Math.round(Number($("#clip-tail").value) * 1000),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "自动分析失败");
    applyAutoEditPlan(data);
    return data;
  } catch (error) {
    showError("#clip-error", error.message || "自动分析失败。");
    return null;
  } finally {
    autoEditBusy = false;
    $("#auto-edit").disabled = !serverResult;
    $("#auto-edit span").textContent = "自动分析";
    $("#auto-edit-render").disabled = !serverResult;
    $("#male-speaker").disabled = false;
    $("#female-speaker").disabled = false;
  }
}

function showClipOutput(data) {
  const video = $("#clip-video");
  video.src = data.video_url;
  video.load();
  $("#download-clip").href = data.video_url;
  $("#download-clip-srt").href = data.srt_url;
  $("#clip-output").hidden = false;
}

async function generateAutoEditClip() {
  if (!serverResult?.job_id || autoEditBusy || clipBusy) return;
  const maleSpeaker = Number($("#male-speaker").value);
  const femaleSpeaker = Number($("#female-speaker").value);
  if (maleSpeaker === femaleSpeaker) {
    showError("#clip-error", "男生和女生需要映射到不同的说话人。");
    return;
  }
  const sameRoles = autoEditPlan?.roles?.male_speaker === maleSpeaker
    && autoEditPlan?.roles?.female_speaker === femaleSpeaker;
  if (!sameRoles || !Array.isArray(autoEditPlan?.clip_ranges)) {
    const plan = await analyzeAutoEdit();
    if (!plan) return;
  }

  const head = Number($("#clip-head").value);
  const tail = Number($("#clip-tail").value);
  if (!Number.isFinite(head) || !Number.isFinite(tail) || head < 0 || tail < 0 || head > 5 || tail > 5) {
    showError("#clip-error", "前后余量需在 0 到 5 秒之间。");
    return;
  }
  clipBusy = true;
  showError("#clip-error", "");
  $("#clip-output").hidden = true;
  $("#video-input").disabled = true;
  $("#run-button").disabled = true;
  $("#upload-zone").classList.add("busy");
  $("#speaker-filter").disabled = true;
  $("#select-filtered").disabled = true;
  $("#clear-selection").disabled = true;
  $("#clip-head").disabled = true;
  $("#clip-tail").disabled = true;
  $("#male-speaker").disabled = true;
  $("#female-speaker").disabled = true;
  $("#auto-edit").disabled = true;
  $("#auto-edit-render").disabled = true;
  $("#auto-edit-render span").textContent = "生成中";
  try {
    const response = await fetch(`/api/jobs/${serverResult.job_id}/auto-edit/clip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        male_speaker: maleSpeaker,
        female_speaker: femaleSpeaker,
        head_ms: Math.round(head * 1000),
        tail_ms: Math.round(tail * 1000),
        max_keep_pause_ms: 350,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "自动剪辑失败");
    if (!data.video_url || !data.srt_url) throw new Error("服务返回的自动剪辑数据不完整。");
    showClipOutput(data);
  } catch (error) {
    showError("#clip-error", error.message || "自动剪辑失败。");
  } finally {
    clipBusy = false;
    $("#video-input").disabled = false;
    $("#run-button").disabled = !ready || !selectedFile;
    $("#upload-zone").classList.remove("busy");
    $("#speaker-filter").disabled = false;
    $("#select-filtered").disabled = false;
    $("#clear-selection").disabled = false;
    $("#clip-head").disabled = false;
    $("#clip-tail").disabled = false;
    $("#male-speaker").disabled = false;
    $("#female-speaker").disabled = false;
    $("#auto-edit").disabled = !serverResult;
    $("#auto-edit-render").disabled = !serverResult;
    $("#auto-edit-render span").textContent = "自动剪辑";
    updateClipSelection();
  }
}

function selectFilteredSegments() {
  if (!serverResult) return;
  const speaker = $("#speaker-filter").value;
  selectedSegments = new Set(
    serverResult.segments.flatMap((segment, index) =>
      speaker === "all" || String(segment.speaker) === speaker ? [index] : [],
    ),
  );
  for (const [index, row] of [...$("#transcript-output").children].entries()) {
    const checkbox = row.querySelector(".caption-select");
    checkbox.checked = selectedSegments.has(index);
    row.classList.toggle("selected", checkbox.checked);
  }
  updateClipSelection();
}

async function generateClip() {
  if (!serverResult?.job_id || clipBusy || selectedSegments.size === 0) return;
  const head = Number($("#clip-head").value);
  const tail = Number($("#clip-tail").value);
  if (!Number.isFinite(head) || !Number.isFinite(tail) || head < 0 || tail < 0 || head > 5 || tail > 5) {
    showError("#clip-error", "前后余量需在 0 到 5 秒之间。");
    return;
  }

  clipBusy = true;
  showError("#clip-error", "");
  $("#clip-output").hidden = true;
  $("#video-input").disabled = true;
  $("#run-button").disabled = true;
  $("#upload-zone").classList.add("busy");
  $("#speaker-filter").disabled = true;
  $("#select-filtered").disabled = true;
  $("#clear-selection").disabled = true;
  $("#clip-head").disabled = true;
  $("#clip-tail").disabled = true;
  $("#make-clip span").textContent = "生成中";
  updateClipSelection();

  try {
    const response = await fetch(`/api/jobs/${serverResult.job_id}/clips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment_indices: [...selectedSegments].sort((a, b) => a - b),
        head_ms: Math.round(head * 1000),
        tail_ms: Math.round(tail * 1000),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "剪辑生成失败");
    if (!data.video_url || !data.srt_url) throw new Error("服务返回的剪辑数据不完整。");

    showClipOutput(data);
  } catch (error) {
    showError("#clip-error", error.message || "剪辑生成失败。");
  } finally {
    clipBusy = false;
    $("#video-input").disabled = false;
    $("#run-button").disabled = !ready || !selectedFile;
    $("#upload-zone").classList.remove("busy");
    $("#speaker-filter").disabled = false;
    $("#select-filtered").disabled = false;
    $("#clear-selection").disabled = false;
    $("#clip-head").disabled = false;
    $("#clip-tail").disabled = false;
    $("#make-clip span").textContent = "生成剪辑";
    updateClipSelection();
  }
}

function finishRequest(error, data) {
  if (error) {
    runToken += 1;
    busy = false;
    clearInterval(elapsedTimer);
    request = null;
    $("#video-input").disabled = false;
    $("#upload-zone").classList.remove("busy");
    $("#run-button span").textContent = "运行流水线";
    $("#run-button").disabled = !ready;
    const failedIndex = Math.max(0, units.findIndex((unit) => nodeStates.get(unit.id) === "running" || nodeStates.get(unit.id) === "waiting"));
    for (const [index, unit] of units.entries()) {
      if (index < failedIndex && nodeStates.get(unit.id) === "running") {
        setNodeState(unit.id, "simulated", 100);
      } else if (index === failedIndex) {
        setNodeState(unit.id, "error");
      } else if (nodeStates.get(unit.id) !== "simulated" && unit.id !== "input") {
        setNodeState(unit.id, "idle");
      }
    }
    $("#task-status").textContent = "处理失败 · 阶段位置为估算";
    $("#task-status").className = "task-status error";
    $("#runtime-message").textContent = "前端估算进度 · 后端未提供分步状态";
    showError("#process-error", error);
    return;
  }

  serverResult = data;
  const resultUrl = new URL(window.location.href);
  resultUrl.searchParams.set("job_id", data.job_id);
  window.history.replaceState({}, "", `${resultUrl.pathname}${resultUrl.search}${resultUrl.hash}`);
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  $("#task-status").textContent = simulationComplete ? "正在显示结果" : "任务已返回 · 展示估算步骤";
  $("#runtime-message").textContent = simulationComplete
    ? "估算步骤已展示 · 正在准备结果"
    : "后端已返回 · 等待步骤展示完成";
  finalizeSuccess();
}

async function finalizeSuccess() {
  if (!serverResult || !simulationComplete || finalizing) return;

  finalizing = true;
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  setNodeState("preview", "done", 100);
  $("#task-status").textContent = "已完成";
  $("#task-status").className = "task-status";
  $("#runtime-message").textContent = `6 项估算 · 字幕预览就绪 · ${((Date.now() - requestStarted) / 1000).toFixed(1)} 秒`;
  renderResult(serverResult);
  request = null;
  busy = false;
  finalizing = false;
  $("#video-input").disabled = false;
  $("#upload-zone").classList.remove("busy");
  $("#run-button span").textContent = "运行流水线";
  $("#run-button").disabled = !ready;
}

async function runEstimatedStages(token) {
  simulationStarted = true;
  setNodeState("input", "done", 100);

  for (let index = 1; index < units.length - 1; index += 1) {
    if (token !== runToken) return;
    const unit = units[index];
    const duration = stageDurations[index];
    const started = performance.now();
    let lastLabel = -1;
    setNodeState(unit.id, "running");
    $("#task-status").textContent = `估算中 · ${unit.title}`;
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (token !== runToken) {
          clearInterval(timer);
          resolve();
          return;
        }
        const progress = Math.min(100, Math.round(((performance.now() - started) / duration) * 100));
        setNodeState(unit.id, "running", progress);
        if (Math.floor(progress / 10) !== lastLabel) {
          lastLabel = Math.floor(progress / 10);
          $("#runtime-message").textContent = `估算 · ${String(index + 1).padStart(2, "0")}/${String(units.length).padStart(2, "0")} · ${Math.floor((Date.now() - requestStarted) / 1000)} 秒`;
        }
        if (progress >= 100) {
          clearInterval(timer);
          resolve();
        }
      }, 80);
    });
    if (token !== runToken) return;
    setNodeState(unit.id, "simulated", 100);
  }

  if (token !== runToken) return;
  simulationComplete = true;
  setNodeState("preview", "waiting", 100);
  $("#task-status").textContent = serverResult ? "正在显示结果" : "等待成品输出";
  $("#runtime-message").textContent = serverResult
    ? "估算步骤已展示 · 正在准备结果"
    : `估算进度 · ${String(units.length).padStart(2, "0")}/${String(units.length).padStart(2, "0")} · 等待服务返回`;
  finalizeSuccess();
}

/*
 * The video endpoint returns one final response, not per-model events. Keep
 * estimated stage progress visible until both the estimate and real job finish.
 */
function startEstimatedStages() {
  if (simulationStarted) return;
  runEstimatedStages(runToken);
}

function runPipeline() {
  if (!selectedFile || busy || clipBusy || !ready) return;
  resetProgress();
  const token = runToken;
  busy = true;
  requestStarted = Date.now();
  showError("#process-error", "");
  clearResult();
  $("#run-button").disabled = true;
  $("#run-button span").textContent = "处理中";
  $("#video-input").disabled = true;
  $("#upload-zone").classList.add("busy");
  $("#task-status").textContent = "上传中";
  $("#task-status").className = "task-status running";
  $("#downloads").hidden = true;
  for (const unit of units) setNodeState(unit.id, "pending");
  setNodeState("input", "running", 0);
  $("#runtime-message").textContent = "正在发送视频";
  const form = new FormData();
  form.append("file", selectedFile);
  form.append("speaker_count", "2");
  request = new XMLHttpRequest();
  request.open("POST", "/api/process-video");
  request.responseType = "json";
  request.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable) {
      const progress = Math.round(event.loaded / event.total * 100);
      setNodeState("input", "running", progress);
      $("#task-status").textContent = `真实上传 · ${progress}%`;
      $("#runtime-message").textContent = "上传视频";
    }
  });
  request.upload.addEventListener("load", () => {
    setNodeState("input", "done", 100);
    startEstimatedStages();
  });
  request.addEventListener("readystatechange", () => {
    if (request.readyState >= XMLHttpRequest.HEADERS_RECEIVED) {
      startEstimatedStages();
    }
  });
  request.addEventListener("load", () => {
    const data = request.response;
    if (request.status < 200 || request.status >= 300) {
      finishRequest(typeof data?.detail === "string" ? data.detail : `处理失败（HTTP ${request.status}）`);
    } else if (!data.job_id || !Array.isArray(data?.segments) || !(data.source_video_url || data.video_url) || !data.srt_url) {
      finishRequest("服务返回的数据不完整。");
    } else {
      finishRequest(null, data);
    }
  });
  request.addEventListener("error", () => finishRequest("连接中断，请确认本地服务仍在运行。"));
  request.send(form);
}

async function restoreJobFromUrl() {
  const jobId = new URLSearchParams(window.location.search).get("job_id");
  if (!jobId) return;
  try {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/result`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "无法恢复任务");
    if (!Array.isArray(data.segments) || !(data.source_video_url || data.video_url) || !data.srt_url) {
      throw new Error("任务结果数据不完整。");
    }
    serverResult = data;
    for (const unit of units) setNodeState(unit.id, "done", 100);
    $("#task-status").textContent = "已恢复";
    $("#task-status").className = "task-status";
    $("#runtime-message").textContent = "本地历史任务";
    $("#run-button").disabled = true;
    renderResult(data);
    try {
      const planResponse = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/auto-edit/plan`);
      if (planResponse.ok) applyAutoEditPlan(await planResponse.json());
    } catch {
      // A saved job may not have an auto-edit plan yet.
    }
  } catch (error) {
    showError("#process-error", error.message || "无法恢复任务。");
  }
}

$("#video-input").addEventListener("change", (event) => {
  if (event.target.files[0]) selectFile(event.target.files[0]);
});
for (const type of ["dragenter", "dragover"]) {
  $("#upload-zone").addEventListener(type, (event) => {
    event.preventDefault();
    if (!busy) $("#upload-zone").classList.add("dragging");
  });
}
for (const type of ["dragleave", "drop"]) {
  $("#upload-zone").addEventListener(type, (event) => {
    event.preventDefault();
    $("#upload-zone").classList.remove("dragging");
  });
}
$("#upload-zone").addEventListener("drop", (event) => {
  if (event.dataTransfer.files[0]) selectFile(event.dataTransfer.files[0]);
});
$("#run-button").addEventListener("click", runPipeline);
$("#select-filtered").addEventListener("click", selectFilteredSegments);
$("#clear-selection").addEventListener("click", () => {
  selectedSegments.clear();
  $("#transcript-output").querySelectorAll(".caption-select").forEach((checkbox) => {
    checkbox.checked = false;
    checkbox.closest(".caption-row").classList.remove("selected");
  });
  updateClipSelection();
});
$("#auto-edit").addEventListener("click", analyzeAutoEdit);
$("#auto-edit-render").addEventListener("click", generateAutoEditClip);
$("#make-clip").addEventListener("click", generateClip);
$("#zoom-in").addEventListener("click", () => { zoom = Math.min(1.8, zoom + .1); applyZoom(); });
$("#zoom-out").addEventListener("click", () => { zoom = Math.max(.3, zoom - .1); applyZoom(); });
$("#fit-scene").addEventListener("click", fitScene);
renderUnits();
new ResizeObserver(drawGraph).observe(viewport);
checkHealth();
restoreJobFromUrl();
setInterval(() => { if (!busy) checkHealth(); }, 15000);
