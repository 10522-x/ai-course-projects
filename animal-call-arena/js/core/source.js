/* =========================================================================
   core/source.js · 数据源抽象：后端 API 优先，静态站点兜底
   -------------------------------------------------------------------------
   同一份产物可以两种方式跑：
     · node server/app.js 起来后：音库来自 API，音频走 /api/audio 流式取，
       选中动物时直接用服务端预计算好的基准曲线，成绩可选提交到服务端。
     · 纯静态部署（dist/ 扔到任意托管）：自动退回 assets/credits.json +
       本地解码提曲线，和原来完全一样。

   判定方式很简单：启动时探一下 /api/healthz。3 秒没响应、或者不是我们
   认识的接口，就当没有后端。这让「部署到静态托管」和「配一台服务器」
   可以是同一份代码，而不是两个分支。
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  var S = AVA.store.S;

  var mode = null;              // 'api' | 'static' | null(未加载)
  var detailCache = {};         // slug -> 详情（含预计算曲线）
  var cid = null;

  /** 匿名设备标识：只用于把同一个人的成绩归在一起，不含任何个人信息。 */
  function clientId() {
    if (cid) return cid;
    try {
      cid = root.localStorage.getItem('ava.cid');
      if (!cid) {
        cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        root.localStorage.setItem('ava.cid', cid);
      }
    } catch (e) { cid = 'anon'; }
    return cid;
  }

  /** 探测后端是否可用。 */
  async function probe() {
    var ctrl = (typeof root.AbortController !== 'undefined') ? new root.AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) { /* 忽略 */ } }, 3000) : null;
    try {
      var r = await fetch('/api/healthz', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      if (!r.ok) return false;
      var h = await r.json();
      return !!(h && h.library && h.library.species > 0);
    } catch (e) {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 载入音库。成功后填充 S.lib / S.byslug 并返回 'api' 或 'static'。
   * 失败抛错，由调用方决定怎么提示。
   */
  async function load() {
    detailCache = {};
    if (await probe()) {
      var r = await fetch('/api/library?limit=500', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var data = await r.json();
      if (!data.items || !data.items.length) throw new Error('后端音库是空的，先跑 server/seed.js');
      S.lib = data.items;
      mode = 'api';
    } else {
      var res = await fetch('assets/credits.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      S.lib = await res.json();
      mode = 'static';
    }
    S.byslug = {};
    S.lib.forEach(function (a) { S.byslug[a.slug] = a; });
    S.loading = false;
    return mode;
  }

  /**
   * 物种详情（含服务端预计算的基准曲线）。静态模式返回 null，
   * 调用方走本地解码提曲线的老路。
   */
  async function detail(slug) {
    if (mode !== 'api') return null;
    if (detailCache[slug]) return detailCache[slug];
    try {
      var r = await fetch('/api/species/' + encodeURIComponent(slug), { cache: 'no-store' });
      if (!r.ok) return null;
      var d = await r.json();
      detailCache[slug] = d;
      return d;
    } catch (e) {
      return null;
    }
  }

  /** 音频地址：API 模式走流式接口，静态模式走站点目录。 */
  function audioUrl(a) {
    return a.audioUrl || ('assets/' + a.file);
  }

  /** 把一次成绩提交到服务端（只在 API 模式；失败静默，不影响本地体验）。 */
  function submitScore(slug, result) {
    if (mode !== 'api') return Promise.resolve(false);
    return fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: slug,
        total: result.total,
        pitchScore: result.pitchScore,
        rhythmScore: result.rhythmScore,
        shapeScore: result.shapeScore,
        stabilityScore: result.stabilityScore,
        cost: result.cost, ratio: result.ratio, r0: result.r0, coverage: result.coverage,
        client: clientId(),
      }),
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /** 全站榜单（静态模式返回 null）。 */
  function leaderboard(limit) {
    if (mode !== 'api') return Promise.resolve(null);
    return fetch('/api/leaderboard?limit=' + (limit || 10), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  AVA.source = {
    load: load,
    detail: detail,
    audioUrl: audioUrl,
    submitScore: submitScore,
    leaderboard: leaderboard,
    clientId: clientId,
    mode: function () { return mode; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
