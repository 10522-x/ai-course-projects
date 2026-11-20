/* =========================================================================
   core/score.js · 四维评分模型
   -------------------------------------------------------------------------
   总分 = 音准 45% + 节奏 25% + 音高走向 20% + 稳定度 10%

   关键设计：中位数归一化。用户音域和动物音域差很多，两边各自减去中位数音高
   变成"相对音高"再比。效果是唱不上去也不吃亏（实测低八度模仿仍能拿 98 分）。

   数值行为被 selftest.js 的梯度用例锁定，移植时一字未改。
   挂载：AVA.score = { WEIGHTS, GRADES, clamp, dtw, pearson, analyze,
                       gradeOf, gradeClass, RULES }
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  var P = AVA.pitch;

  var WEIGHTS = { pitch: 0.45, rhythm: 0.25, shape: 0.20, stability: 0.10 };
  var PITCH_K = 22, PITCH_BASE = 100;
  var GRADES = [[88, 'S'], [76, 'A'], [62, 'B'], [45, 'C']];
  var N_POINTS = 64;              // 比较前两条曲线重采样到多少点

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /** 带约束的 DTW。 */
  function dtw(a, b, band) {
    const n = a.length, m = b.length;
    if (!n || !m) return 12;
    // 带宽故意收窄到 8%：两条曲线已按时间归一化，再让 DTW 大幅弯时间轴
    // 就会靠"挪时间"把音高错误吸收掉（实测 35% 带宽时走音 4 个半音还能拿 87 分）
    const B = band || Math.max(3, Math.round(Math.max(n, m) * 0.08));
    let prev = new Float64Array(m + 1).fill(Infinity);
    let cur = new Float64Array(m + 1).fill(Infinity);
    prev[0] = 0;
    for (let i = 1; i <= n; i++) {
      cur.fill(Infinity);
      const lo = Math.max(1, i - B), hi = Math.min(m, i + B);
      if (lo > hi) { const t = prev; prev = cur; cur = t; continue; }
      for (let j = lo; j <= hi; j++) {
        const c = Math.abs(a[i - 1] - b[j - 1]);
        let best = prev[j];
        if (prev[j - 1] < best) best = prev[j - 1];
        if (cur[j - 1] < best) best = cur[j - 1];
        cur[j] = c + best;
      }
      const t = prev; prev = cur; cur = t;
    }
    return prev[m] / Math.max(n, m);
  }

  function pearson(a, b) {
    const n = a.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    if (da < 1e-6 || db < 1e-6) return 0;
    return num / Math.sqrt(da * db);
  }

  /** 评分四维的权重与算法说明，供「关于」页展示。 */
  var RULES = {
    pitch: '两条曲线各自减去中位数音高 → 按时间重采样到 ' + N_POINTS + ' 点 → 窄带 DTW 对齐 → 平均偏差（半音）。',
    rhythm: '你的有声段跨度 ÷ 原声有声段跨度，取对数比。起手稍慢不会被判错。',
    shape: '时序归一化后的皮尔逊相关系数，再乘起伏幅度折扣。走向反了会明显掉分。',
    stability: '有声帧占比 + 相邻帧音高抖动。',
  };

  /**
   * 给一段用户录音打分。
   * frames: [{t,f,cl}] 录音期间逐帧记录
   * ref:    { vals, times, dur } 基准曲线
   */
  function analyze(frames, ref) {
    const voiced = frames.filter(f => f.f > 0 && f.cl > P.PF.VOICED_CL);
    if (voiced.length < 6) {
      return { error: '没听到足够清楚的声音。请靠近麦克风、把声音拖长一点，环境安静些再试。' };
    }
    const spanDur = Math.max(1e-3, voiced[voiced.length - 1].t - voiced[0].t);
    const sm = P.smoothFrames(voiced);
    const rawSemi = sm.map(P.hz2semi);
    const uMed = P.median(rawSemi);
    const uSemi = rawSemi.map(v => v - uMed);

    const rMed = P.median(ref.vals);
    const rSemi = ref.vals.map(v => v - rMed);

    const N = N_POINTS;
    const rR = P.resampleByTime(rSemi, ref.times, N);
    const rNorm = rR.map(v => v - P.median(rR));
    const uR = P.resampleByTime(uSemi, voiced.map(f => f.t), N);
    const uNorm = uR.map(v => v - P.median(uR));

    const cost = dtw(rNorm, uNorm);
    const pitchScore = clamp(PITCH_BASE - cost * PITCH_K, 0, 100);

    const ratio = spanDur / Math.max(0.15, ref.dur);
    const rhythmScore = clamp(100 - Math.abs(Math.log(ratio)) * 78, 0, 100);

    const r0 = pearson(rNorm, uNorm);
    const sd = arr => {
      const m = arr.reduce((s, v) => s + v, 0) / arr.length;
      return Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length);
    };
    const sdR = sd(rNorm), sdU = sd(uNorm);
    const ampPenalty = (sdR > 0.3 && sdU > 0.3)
      ? clamp(1 - Math.abs(sdU - sdR) / sdR * 0.35, 0.5, 1) : 1;
    const shapeScore = clamp((r0 * 100 + 32) * ampPenalty, 0, 100);

    const coverage = voiced.length / frames.length;
    let jit = 0, jn = 0;
    for (let i = 1; i < uSemi.length; i++) {
      const d = Math.abs(uSemi[i] - uSemi[i - 1]);
      if (d < 3) { jit += d; jn++; }
    }
    const jitter = jn ? jit / jn : 0;
    const stabilityScore = clamp(coverage * 62 + (1 - clamp(jitter / 1.6, 0, 1)) * 38, 0, 100);

    const total = Math.round(
      pitchScore * WEIGHTS.pitch + rhythmScore * WEIGHTS.rhythm +
      shapeScore * WEIGHTS.shape + stabilityScore * WEIGHTS.stability);

    const fb = {
      pitch: cost <= 0.7 ? '音高几乎踩在点上了。' :
             cost <= 1.6 ? '大方向对，个别音偏高或偏低。' :
             cost <= 3.0 ? '有几个音跑掉了，注意原声的高低起伏。' : '音高和原声差得比较远，先跟着原声哼几遍。',
      rhythm: ratio > 1.35 ? '你比原声慢了不少，可以再利落一点。' :
              ratio < 0.72 ? '你比原声快太多了，尾音试着拖住。' :
              Math.abs(ratio - 1) < 0.18 ? '时长拿捏得很准。' : '节奏基本贴住了原声。',
      shape: r0 > 0.6 ? '这条曲线走势跟原声高度一致。' :
             r0 > 0.25 ? '起伏方向是对的，细节还能再像一点。' :
             r0 > -0.1 ? '形状只是约等于，注意哪里该升、哪里该降。' : '走向反了，再听一遍原声。',
      stability: coverage > .82 ? '几乎没断气，一口气很稳。' :
                 coverage > .6 ? '中间有停顿，但整体连贯。' : '断得比较多，试着让声音连起来。'
    };
    return {
      total: total, pitchScore: pitchScore, rhythmScore: rhythmScore,
      shapeScore: shapeScore, stabilityScore: stabilityScore, fb: fb,
      cost: cost, ratio: ratio, r0: r0, coverage: coverage,
      userVals: rawSemi, userTimes: voiced.map(f => f.t),
    };
  }

  /** 分数 → 等级字母。 */
  function gradeOf(t) {
    for (var i = 0; i < GRADES.length; i++) if (t >= GRADES[i][0]) return GRADES[i][1];
    return 'D';
  }

  /** 分数 → 语义色 class（颜色只写在 CSS 里，这里只给语义）。 */
  function gradeClass(t) { return 'g-' + gradeOf(t).toLowerCase(); }

  /** 等级 → 一句总评。 */
  var VERDICT = {
    S: '封神了，这只动物本物就是你。',
    A: '非常像了，细节再打磨一下就是满分。',
    B: '有那味儿了，多练两遍会明显进步。',
    C: '方向没错，跟着原声再抓一抓高低和节奏。',
    D: '别灰心，先小声跟着原声哼，找找调子。',
  };

  AVA.score = {
    WEIGHTS: WEIGHTS, GRADES: GRADES, RULES: RULES, VERDICT: VERDICT,
    clamp: clamp, dtw: dtw, pearson: pearson, analyze: analyze,
    gradeOf: gradeOf, gradeClass: gradeClass,
  };
})(typeof window !== 'undefined' ? window : globalThis);
