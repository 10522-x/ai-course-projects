/* =========================================================================
   core/store.js · 运行期状态 + 本地持久化 + 派生统计
   -------------------------------------------------------------------------
   挂载：AVA.store = { S, load, save, record, stats, difficulty,
                       achievements, prefs, setTheme, markListened }
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};

  var KEY = 'ava.v2';
  var HISTORY_CAP = 300;

  /* ---------------- 运行期状态（不持久化） ---------------- */
  var S = {
    lib: [],            // credits.json 的 26 条
    byslug: {},         // slug -> 动物记录
    loading: true,      // 音库加载中
    error: null,        // 音库加载失败原因
    animal: null,       // 当前选中的动物
    buffer: null,       // 解码后的 AudioBuffer
    pcm: null,          // 单声道采样
    ref: null,          // 基准曲线 {vals,times,dur}
    refPeaks: null,     // 背景波形
    clipT0: 0, clipT1: 0, clipDur: 0,
    busy: false, busySlug: null,
    recording: false,
    frames: [],         // 本次录音的逐帧结果
    userVals: null, userTimes: null,   // 实时画的用户曲线
    score: null,        // 上一次打分结果
    takeUrl: null,      // 上一次录音的回放 URL
    playProgress: null, // 播放头 0~1
  };

  /* ---------------- 持久化数据 ---------------- */
  var data = {
    best: {},           // slug -> 历史最高分
    attempts: {},       // slug -> 尝试次数
    history: [],        // [{s:slug, t:total, at:timestamp}] 最近在前
    listened: {},       // slug -> true，听过的原声
    theme: null,        // 'light' | 'dark' | null(跟随系统)
    lastSlug: null,
  };

  function load() {
    try {
      var raw = root.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        data.best = parsed.best || {};
        data.attempts = parsed.attempts || {};
        data.history = parsed.history || [];
        data.listened = parsed.listened || {};
        data.theme = parsed.theme || null;
        data.lastSlug = parsed.lastSlug || null;
      }
    } catch (e) { /* 存储不可用或数据损坏，用默认值继续跑 */ }
    return data;
  }

  function save() {
    try {
      if (data.history.length > HISTORY_CAP) data.history = data.history.slice(0, HISTORY_CAP);
      root.localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* 隐私模式下写入会抛错，忽略即可，不影响本次使用 */ }
  }

  /** 记一次成绩，返回 { isBest, prev, total }。 */
  function record(slug, total) {
    var prev = data.best[slug];
    var isBest = prev === undefined || total > prev;
    if (isBest) data.best[slug] = total;
    data.attempts[slug] = (data.attempts[slug] || 0) + 1;
    data.history.unshift({ s: slug, t: total, at: Date.now() });
    data.lastSlug = slug;
    save();
    return { isBest: isBest, prev: prev, total: total };
  }

  function markListened(slug) {
    if (!data.listened[slug]) { data.listened[slug] = true; save(); }
  }

  function setTheme(t) {
    data.theme = t;
    save();
  }

  function reset() {
    data.best = {}; data.attempts = {}; data.history = [];
    data.listened = {}; data.lastSlug = null;
    save();
  }

  /* ---------------- 难度分级 ---------------- */
  /**
   * 由音频自身特征推导，而不是人工标注。
   * 这样加新物种时只需要跑工具链，难度会自动算出来，前端一行都不用改。
   *
   * 三个维度：音高跨度（要爬的音程）、片段时长（要记的时长）、发声密度（单位时间要切换的音）。
   * 做法是把三者各自归一化后求和，再在"当前音库内部"按分位切成四档。
   * 用相对分位而不是绝对阈值，是为了保证任何规模的音库都能分出层次：
   * 26 种全是鸟也好，加进大象和鲸鱼也好，四档始终有意义。
   */
  function norm(v, lo, hi) { return Math.max(0, Math.min(1, (v - lo) / (hi - lo))); }

  var _diffCache = null, _diffKey = '';

  function difficultyTable() {
    var key = S.lib.map(function (a) { return a.slug; }).join(',');
    if (_diffCache && _diffKey === key) return _diffCache;

    var scored = S.lib.map(function (a) {
      var span = a.pitchSpan || 0;
      var dur = a.clipDuration || 0;
      var dens = (a.voicedFrames || 0) / Math.max(0.1, dur);
      return {
        slug: a.slug,
        raw: norm(span, 2, 20) + norm(dur, 1.2, 5) + norm(dens, 15, 50),
      };
    }).sort(function (x, y) { return x.raw - y.raw; });

    var out = {};
    var n = Math.max(1, scored.length - 1);
    scored.forEach(function (s, i) {
      var q = i / n;
      out[s.slug] = q < 0.28 ? 1 : q < 0.56 ? 2 : q < 0.82 ? 3 : 4;
    });
    _diffCache = out; _diffKey = key;
    return out;
  }

  /** 返回 1~4。含义是"在这套音库里相对有多难"。 */
  function difficulty(a) {
    if (!a) return 1;
    if (!S.lib.length) {
      var span0 = a.pitchSpan || 0, dur0 = a.clipDuration || 0;
      var d0 = (a.voicedFrames || 0) / Math.max(0.1, dur0);
      var p0 = norm(span0, 2, 20) + norm(dur0, 1.2, 5) + norm(d0, 15, 50);
      return p0 < 0.9 ? 1 : p0 < 1.5 ? 2 : p0 < 2.1 ? 3 : 4;
    }
    return difficultyTable()[a.slug] || 1;
  }

  var DIFF_LABEL = { 1: '入门', 2: '简单', 3: '进阶', 4: '硬核' };

  /* ---------------- 汇总统计 ---------------- */
  function stats() {
    var total = S.lib.length || 0;
    var played = 0, listened = 0, bestTotal = 0, sumBest = 0, bestCount = 0;
    var tally = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    var attemptsTotal = 0;

    for (var i = 0; i < S.lib.length; i++) {
      var slug = S.lib[i].slug;
      if (data.attempts[slug]) played++;
      if (data.listened[slug]) listened++;
      attemptsTotal += data.attempts[slug] || 0;
      var b = data.best[slug];
      if (typeof b === 'number') {
        bestCount++; sumBest += b;
        if (b > bestTotal) bestTotal = b;
        tally[AVA.score.gradeOf(b)]++;
      }
    }
    return {
      species: total,
      played: played,
      listened: listened,
      attempts: attemptsTotal,
      bestTotal: bestTotal,
      bestAverage: bestCount ? Math.round(sumBest / bestCount) : 0,
      bestCount: bestCount,
      tally: tally,
      completion: total ? played / total : 0,
    };
  }

  /** 最近 n 次成绩（用于三连 S 之类的判定）。 */
  function recent(n) { return data.history.slice(0, n); }

  /* ---------------- 成就 ---------------- */
  /** 每个成就都给出"当前进度 / 目标"，没解锁也能看到离得多近。 */
  var ACH_DEFS = [
    {
      id: 'first', name: '初次开口', icon: 'i-mic',
      desc: '完成第一次模仿',
      goal: 1, cur: function (st) { return Math.min(st.attempts, 1); },
    },
    {
      id: 'perfect', name: '高分猎手', icon: 'i-sparkle',
      desc: '单次拿到 95 分以上',
      goal: 95, cur: function (st) { return st.bestTotal; },
    },
    {
      id: 's', name: '金嗓子', icon: 'i-trophy',
      desc: '至少一个物种拿到 S 级',
      goal: 1, cur: function (st) { return st.tally.S; },
    },
    {
      id: 's5', name: '五声齐鸣', icon: 'i-waves',
      desc: '五个物种都拿到 S 级',
      goal: 5, cur: function (st) { return st.tally.S; },
    },
    {
      id: 'streak', name: '三连冠', icon: 'i-flame',
      desc: '连续三次拿到 S 级',
      goal: 3,
      cur: function () {
        var r = recent(3);
        if (r.length < 3) return r.filter(function (x) { return AVA.score.gradeOf(x.t) === 'S'; }).length;
        return r.every(function (x) { return AVA.score.gradeOf(x.t) === 'S'; }) ? 3 : 0;
      },
    },
    {
      id: 'dedicated', name: '死磕到底', icon: 'i-refresh',
      desc: '同一物种尝试满 10 次',
      goal: 10,
      cur: function () {
        var m = 0;
        for (var k in data.attempts) if (data.attempts[k] > m) m = data.attempts[k];
        return Math.min(m, 10);
      },
    },
    {
      id: 'scholar', name: '耳朵学者', icon: 'i-headphones',
      desc: '听完整个音库的原声',
      goal: 0, // 用物种总数
      cur: function (st) { return st.listened; },
    },
    {
      id: 'all', name: '全线通关', icon: 'i-flag',
      desc: '把每一种都挑战一遍',
      goal: 0,
      cur: function (st) { return st.played; },
    },
  ];

  function achievements() {
    var st = stats();
    return ACH_DEFS.map(function (d) {
      var goal = d.goal || st.species || 1;
      var cur = Math.max(0, Math.min(d.cur(st), goal));
      return {
        id: d.id, name: d.name, icon: d.icon, desc: d.desc,
        goal: goal, cur: cur, got: cur >= goal,
        pct: goal ? cur / goal : 0,
      };
    });
  }

  AVA.store = {
    S: S, data: data, DIFF_LABEL: DIFF_LABEL,
    load: load, save: save, record: record, reset: reset,
    markListened: markListened, setTheme: setTheme,
    difficulty: difficulty, stats: stats, achievements: achievements,
    recent: recent,
  };
})(typeof window !== 'undefined' ? window : globalThis);
