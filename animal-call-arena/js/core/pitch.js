/* =========================================================================
   core/pitch.js · 音高工具：逐帧测量、清洗、生成基准曲线
   -------------------------------------------------------------------------
   挂载：AVA.pitch = { PF, hz2semi, median, resampleByTime,
                       pcmFrames, smoothFrames, contourOf, mixToMono, peaksOf }
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  var detectPitch = AVA.signal.detectPitch;

  // PF 是前端一套统一的音频参数，"算不算有音高"的门限也在这里。
  // VOICED_CL：0.6 正好压在很多野外录音的清晰度中位数上，会把整段录音判成静音，
  // 所以放到 0.5（实测白噪声只有 0.07，不会误收）
  var PF = { FFT: 2048, FPS: 50, MINF: 70, MAXF: 3000, VOICED_CL: 0.5 };

  var hz2semi = function (f) { return 69 + 12 * Math.log2(f / 440); };

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** 把 (值, 时间) 序列按时间等距重采样成 N 个点。 */
  function resampleByTime(vals, times, N) {
    const out = new Array(N);
    const len = Math.min(vals.length, times.length);
    if (len === 0) return out.fill(0);
    if (len === 1) return out.fill(vals[0]);
    const t0 = times[0], t1 = times[len - 1];
    const span = Math.max(1e-6, t1 - t0);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const t = t0 + span * i / (N - 1);
      while (j < len - 2 && times[j + 1] < t) j++;
      const a = times[j], b = times[j + 1];
      const k = b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0;
      out[i] = vals[j] + (vals[j + 1] - vals[j]) * k;
    }
    return out;
  }

  /** 对 [t0,t1) 区间逐帧测音高。返回 [{t,f,cl,rms}]，t 相对 t0。 */
  function pcmFrames(pcm, sr, t0, t1) {
    const FFT = PF.FFT;
    const hop = Math.max(1, Math.round(sr / PF.FPS));
    const s0 = Math.max(0, Math.floor((t0 || 0) * sr));
    const s1 = Math.min(pcm.length, Math.floor((t1 == null ? pcm.length / sr : t1) * sr));
    const buf = new Float32Array(FFT);
    const out = [];
    for (let n = s0; n + FFT <= s1; n += hop) {
      buf.set(pcm.subarray(n, n + FFT));
      let rms = 0;
      for (let i = 0; i < FFT; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / FFT);
      const [f, cl] = detectPitch(buf, sr, PF.MINF, PF.MAXF);
      out.push({ t: (n - s0 + FFT / 2) / sr, f, cl, rms });
    }
    return out;
  }

  /** 八度误判修正 + 离群点剔除。返回修正后的频率数组（与输入等长）。 */
  function smoothFrames(frames) {
    const f = frames.map(x => x.f);
    const out = f.slice();
    // ① 离群点：偏离近邻中位数超过 5 个半音就替换掉
    for (let i = 0; i < f.length; i++) {
      const w = f.slice(Math.max(0, i - 2), Math.min(f.length, i + 3));
      const med = median(w);
      if (med > 0 && f[i] > 0 && Math.abs(1200 * Math.log2(f[i] / med)) > 500) out[i] = med;
    }
    // ② 八度误判：跟"前后 0.3 秒的中位数"比，而不是只跟上一帧比。
    //    只比上一帧的话，一旦连续几帧都错，纠错就会一路跟着错下去。
    for (let i = 0; i < out.length; i++) {
      if (!(out[i] > 0)) continue;
      const w = out.slice(Math.max(0, i - 7), Math.min(out.length, i + 8)).filter(v => v > 0);
      if (w.length < 4) continue;
      const m = median(w);
      if (!(m > 0)) continue;
      const r = Math.log2(out[i] / m);
      if (r > 0.8 && r < 1.2 && out[i] / 2 >= PF.MINF) out[i] = out[i] / 2;
      else if (r < -0.8 && r > -1.2 && out[i] * 2 <= PF.MAXF) out[i] = out[i] * 2;
    }
    // ③ 收尾：再做一次宽窗口（±0.32s）离群剔除，清掉剩下的零星单帧毛刺。
    //    参照物是近邻中位数，所以真实的快速音高变化不会被误删。
    for (let i = 0; i < out.length; i++) {
      if (!(out[i] > 0)) continue;
      const w = out.slice(Math.max(0, i - 8), Math.min(out.length, i + 9)).filter(v => v > 0);
      if (w.length < 6) continue;
      const m = median(w);
      if (m > 0 && Math.abs(1200 * Math.log2(out[i] / m)) > 600) out[i] = m;
    }
    return out;
  }

  /** 从帧序列生成"基准曲线"：只保留有声帧，转半音，保留真实时间戳。 */
  function contourOf(frames) {
    const voiced = frames.filter(f => f.f > 0 && f.cl > PF.VOICED_CL);
    if (voiced.length < 4) return null;
    const sm = smoothFrames(voiced);
    return {
      vals: sm.map(hz2semi),
      times: voiced.map(f => f.t),
      voicedRatio: voiced.length / Math.max(1, frames.length),
    };
  }

  /** 多声道混合成单声道。 */
  function mixToMono(buffer) {
    const n = buffer.length;
    const out = new Float32Array(n);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const ch = buffer.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += ch[i] / buffer.numberOfChannels;
    }
    return out;
  }

  /** 波形缩略图数据（画背景用）。 */
  function peaksOf(pcm, sr, t0, t1, buckets) {
    const s0 = Math.max(0, Math.floor(t0 * sr)), s1 = Math.min(pcm.length, Math.ceil(t1 * sr));
    const step = Math.max(1, Math.floor((s1 - s0) / buckets));
    const out = [];
    let mx = 1e-6;
    for (let i = 0; i < buckets; i++) {
      let hi = 0;
      const a = s0 + i * step, b = Math.min(s1, a + step);
      for (let n = a; n < b; n++) { const v = Math.abs(pcm[n]); if (v > hi) hi = v; }
      out.push(hi);
      if (hi > mx) mx = hi;
    }
    return out.map(v => v / mx);
  }

  AVA.pitch = {
    PF: PF,
    hz2semi: hz2semi,
    median: median,
    resampleByTime: resampleByTime,
    pcmFrames: pcmFrames,
    smoothFrames: smoothFrames,
    contourOf: contourOf,
    mixToMono: mixToMono,
    peaksOf: peaksOf,
  };
})(typeof window !== 'undefined' ? window : globalThis);
