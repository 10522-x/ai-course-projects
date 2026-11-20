/* =========================================================================
   core/signal.js · FFT 与基频检测（MPM）
   -------------------------------------------------------------------------
   这是整个应用的数学地基，算法本身已被 selftest.js 的 26 项用例锁定，
   移植时只做了模块化包装，数值行为一字未改。
   挂载：AVA.signal = { fft, getBufs, detectPitch }
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};

  var _fftBuf = {};

  /** 原地 radix-2 迭代 FFT。re / im 长度必须是 2 的幂。 */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cwr = 1, cwi = 0;
        for (let j = 0; j < half; j++) {
          const ur = re[i + j], ui = im[i + j];
          const xr = re[i + j + half], xi = im[i + j + half];
          const vr = xr * cwr - xi * cwi;
          const vi = xr * cwi + xi * cwr;
          re[i + j] = ur + vr; im[i + j] = ui + vi;
          re[i + j + half] = ur - vr; im[i + j + half] = ui - vi;
          const nwr = cwr * wr - cwi * wi;
          cwi = cwr * wi + cwi * wr; cwr = nwr;
        }
      }
    }
  }

  /** 复用 FFT 缓冲区，避免每帧重新分配。 */
  function getBufs(size) {
    if (!_fftBuf[size] || _fftBuf[size].re.length !== size) {
      _fftBuf[size] = { re: new Float32Array(size), im: new Float32Array(size) };
    }
    return _fftBuf[size];
  }

  /** 返回 [频率Hz, 清晰度0~1]。清晰度低说明不是有音高的声音。
   *  实现：McLeod Pitch Method。关键在于 NSDF 的分母 m(τ) 必须按"重叠区间的能量"归一化，
   *  否则小 lag 处会被系统性抬高，导致总是锁到二倍频（叫 120Hz 的雕鸮被读成 717Hz 就是这个原因）。 */
  function detectPitch(buf, sr, minF, maxF) {
    const n = buf.length;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += buf[i];
    mean /= n;
    let energy = 0;
    for (let i = 0; i < n; i++) { const d = buf[i] - mean; energy += d * d; }
    if (Math.sqrt(energy / n) < 0.008) return [0, 0];

    let size = 1; while (size < 2 * n) size <<= 1;
    const { re, im } = getBufs(size);
    re.fill(0); im.fill(0);
    for (let i = 0; i < n; i++) re[i] = buf[i] - mean;
    fft(re, im);
    for (let i = 0; i < size; i++) { const p = re[i] * re[i] + im[i] * im[i]; re[i] = p; im[i] = 0; }
    fft(re, im);   // 两次正向 FFT ≡ size × 循环自相关

    const minLag = Math.max(2, Math.floor(sr / maxF));
    const maxLag = Math.min(n - 2, Math.ceil(sr / minF));
    if (maxLag <= minLag + 2) return [0, 0];

    // 前缀平方和 -> m(τ) = Σ_{j< n-τ} x[j]² + Σ_{j=τ}^{n-1} x[j]²
    const P = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) { const d = buf[i] - mean; P[i + 1] = P[i] + d * d; }

    const nsdf = new Float64Array(maxLag + 2);
    let M = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const m = P[n - lag] + (P[n] - P[lag]);
      const v = m > 1e-12 ? 2 * (re[lag] / size) / m : 0;
      nsdf[lag] = v;
      if (v > M) M = v;
    }
    if (M <= 0.05) return [0, 0];

    const th = M * 0.9;   // 取最高峰的 90% 作为门限，再挑"最早"越过门限的峰
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      if (nsdf[lag] >= th && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
        const a = nsdf[lag - 1], b = nsdf[lag], c = nsdf[lag + 1];
        const den = a - 2 * b + c;
        const delta = den !== 0 ? 0.5 * (a - c) / den : 0;
        const lagEst = lag + Math.max(-0.5, Math.min(0.5, delta));
        const f = sr / lagEst;
        if (f >= minF && f <= maxF) return [f, Math.max(0, Math.min(1, b))];
      }
    }
    return [sr / minLag, 0];
  }

  AVA.signal = { fft: fft, getBufs: getBufs, detectPitch: detectPitch };
})(typeof window !== 'undefined' ? window : globalThis);
