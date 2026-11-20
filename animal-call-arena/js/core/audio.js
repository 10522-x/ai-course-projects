/* =========================================================================
   core/audio.js · Web Audio 引擎：解码、播放、麦克风采集
   -------------------------------------------------------------------------
   挂载：AVA.audio = { ensure, ctx, master, stop, decode, play,
                       openMic, closeMic, recorderSupported, record }
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};

  var AC = null;
  var master = null;
  var playing = null;          // 当前正在播放的 AudioBufferSourceNode
  var cache = {};              // slug -> AudioBuffer，避免来回切换时重复解码

  /** 惰性建 AudioContext。浏览器要求必须由用户手势触发后才能出声。 */
  function ensure() {
    if (!AC) {
      var Ctor = root.AudioContext || root.webkitAudioContext;
      AC = new Ctor();
      master = AC.createGain();
      master.gain.value = 0.9;
      master.connect(AC.destination);
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function ctx() { return ensure(); }
  function masterNode() { ensure(); return master; }

  /** 停止正在播放的原声。 */
  function stop() {
    if (playing) {
      try { playing.stop(); } catch (e) { /* 已经自然结束 */ }
      playing = null;
    }
  }

  /** 取音频并解码；同一条录音只解码一次。地址优先用数据源给的（API 模式下是流式接口）。 */
  async function decode(a) {
    if (cache[a.slug]) return cache[a.slug];
    var url = (AVA.source && AVA.source.audioUrl(a)) || ('assets/' + a.file);
    var res = await fetch(url);
    if (!res.ok) throw new Error('音频读取失败（HTTP ' + res.status + '）');
    var ab = await res.arrayBuffer();
    var buf = await ensure().decodeAudioData(ab);
    cache[a.slug] = buf;
    return buf;
  }

  /**
   * 播放 buffer 的 [t0, t0+dur) 区间。
   * onTick(progress 0~1) 会被逐帧回调，用于驱动播放头。
   * 返回一个 { stop } 句柄。
   */
  function play(buffer, t0, dur, onTick) {
    stop();
    var c = ensure();
    var src = c.createBufferSource();
    src.buffer = buffer;
    var g = c.createGain();
    g.gain.value = 1;
    src.connect(g); g.connect(master);
    var startAt = c.currentTime + 0.06;
    src.start(startAt, t0, dur);
    playing = src;

    var handle = { stop: function () { stop(); if (onTick) onTick(1); } };
    src.onended = function () { if (playing === src) playing = null; if (onTick) onTick(1); };

    if (onTick) {
      var loop = function () {
        if (playing !== src) return;                 // 已被新的播放替换 / 停止
        var p = (c.currentTime - startAt) / dur;
        if (p >= 1) { onTick(1); return; }
        onTick(Math.max(0, p));
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    return handle;
  }

  /* ---------------- 麦克风 ---------------- */

  var mic = null;              // { stream, node, analyser, buf, sampleRate }
  var rec = null;              // MediaRecorder 实例
  var chunks = [];

  function recorderSupported() {
    return typeof root.MediaRecorder !== 'undefined' && !!(root.navigator &&
      root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia);
  }

  /**
   * 打开麦克风并建好分析节点。
   * 关掉浏览器的降噪 / 自动增益：它们会把音高抹平，直接影响打分。
   */
  async function openMic() {
    if (mic) return mic;
    var stream = await root.navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    var c = ensure();
    var node = c.createMediaStreamSource(stream);
    var analyser = c.createAnalyser();
    analyser.fftSize = AVA.pitch.PF.FFT;
    analyser.smoothingTimeConstant = 0;
    node.connect(analyser);

    // 顺带录一份真音频，用于"回听我的模仿"（浏览器不支持时静默降级）
    if (recorderSupported()) {
      try {
        rec = new root.MediaRecorder(stream);
        chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.start();
      } catch (e) { rec = null; }
    }

    mic = {
      stream: stream, node: node, analyser: analyser,
      buf: new Float32Array(analyser.fftSize), sampleRate: c.sampleRate,
    };
    return mic;
  }

  /** 结束一次采集，返回录到的音频 blob（不可用则为 null）。 */
  function closeMic() {
    var blobPromise = Promise.resolve(null);
    if (rec) {
      var r = rec;
      blobPromise = new Promise(function (resolve) {
        r.onstop = function () {
          try { resolve(chunks.length ? new Blob(chunks, { type: r.mimeType || 'audio/webm' }) : null); }
          catch (e) { resolve(null); }
        };
        try { r.stop(); } catch (e) { resolve(null); }
      });
      rec = null;
    }
    chunks = [];
    if (mic) {
      mic.stream.getTracks().forEach(function (t) { t.stop(); });
      try { mic.node.disconnect(); } catch (e) { /* 忽略 */ }
      mic = null;
    }
    return blobPromise;
  }

  /** 当前麦克风是否已打开。 */
  function isMicOpen() { return !!mic; }

  /** 取一帧时域数据，并算出 RMS 电平（给电平条用）。 */
  function sample() {
    if (!mic) return null;
    mic.analyser.getFloatTimeDomainData(mic.buf);
    var sum = 0;
    for (var i = 0; i < mic.buf.length; i++) sum += mic.buf[i] * mic.buf[i];
    return { buf: mic.buf, rms: Math.sqrt(sum / mic.buf.length), sampleRate: mic.sampleRate };
  }

  AVA.audio = {
    ensure: ensure,
    ctx: ctx,
    master: masterNode,
    stop: stop,
    decode: decode,
    play: play,
    openMic: openMic,
    closeMic: closeMic,
    isMicOpen: isMicOpen,
    sample: sample,
    recorderSupported: recorderSupported,
  };
})(typeof window !== 'undefined' ? window : globalThis);
