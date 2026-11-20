/* =========================================================================
   app.js · 路由、导航、主题、音库加载、快捷键
   -------------------------------------------------------------------------
   这是唯一一个"会自己动起来"的模块：其余的 core / ui 模块都只导出能力。
   测试环境里把 window.AVA_NOAUTO 设为 true，就不会自动初始化。
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  var D = AVA.dom, ST = AVA.store, A = AVA.audio;
  var S = ST.S;
  var doc = root.document;
  var IC = D.icon;

  var ORDER = ['arena', 'codex', 'records', 'about'];
  var currentId = null;
  var navEls = {};

  /* ============================ 顶栏 ============================ */

  function buildChrome() {
    // 桌面标签
    var tabs = D.$('#navTabs');
    tabs.innerHTML = ORDER.map(function (id) {
      var v = AVA.views[id];
      return '<button class="tab" role="tab" id="tab-' + id + '" data-v="' + id + '" ' +
        'aria-selected="false" aria-controls="view-' + id + '">' +
        IC(v.icon) + '<span>' + v.label + '</span>' +
        // 「还有多少种没挑战」是去图鉴逛的提示，挂在图鉴上才说得通
        (id === 'codex' ? '<span class="tab-badge" id="tabBadge" hidden></span>' : '') +
        '</button>';
    }).join('');

    // 移动端标签栏
    var bar = D.$('#tabbar');
    bar.innerHTML = ORDER.map(function (id) {
      var v = AVA.views[id];
      return '<button data-v="' + id + '" id="mob-' + id + '" aria-selected="false">' +
        IC(v.icon) + '<span>' + v.label + '</span></button>';
    }).join('');

    D.$$('[data-v]').forEach(function (b) {
      b.onclick = function () { go(b.dataset.v); };
    });

    // 右侧：最高分 + 主题切换
    var right = D.$('#navRight');
    right.innerHTML =
      '<div class="nav-stat" title="我的最高分"><span class="k">最高分</span>' +
      '<span class="v" id="navBest">--</span></div>' +
      '<button class="icon-btn" id="themeBtn" aria-label="切换深浅色主题"></button>';
    D.$('#themeBtn').onclick = function () { toggleTheme(); };
    paintThemeBtn();

    navEls.tabs = tabs;
    navEls.bar = bar;
    navEls.best = D.$('#navBest');
    navEls.badge = D.$('#tabBadge');

    // 顶栏滚动状态：用哨兵 + IntersectionObserver，不监听 scroll
    var sentinel = D.$('#navSentinel');
    if (sentinel && root.IntersectionObserver) {
      new root.IntersectionObserver(function (entries) {
        D.$('#nav').classList.toggle('stuck', !entries[0].isIntersecting);
      }, { threshold: 0 }).observe(sentinel);
    }
  }

  function refreshChrome() {
    var st = ST.stats();
    if (navEls.best) navEls.best.textContent = st.bestTotal ? String(st.bestTotal) : '--';
    if (navEls.badge) {
      var left = Math.max(0, st.species - st.played);
      navEls.badge.hidden = !st.played;
      navEls.badge.textContent = left ? left : '✓';
      navEls.badge.title = left ? '还有 ' + left + ' 种没挑战' : '全部挑战完毕';
    }
    D.$$('.pchip').forEach(function () { /* 由 arena 自己刷新 */ });
  }

  /* ============================ 主题 ============================ */

  var SUN = '<svg class="ico" aria-hidden="true"><use href="#i-sun"/></svg>';
  var MOON = '<svg class="ico" aria-hidden="true"><use href="#i-moon"/></svg>';

  function currentTheme() { return doc.documentElement.getAttribute('data-theme') || 'light'; }

  function paintThemeBtn() {
    var btn = D.$('#themeBtn');
    if (!btn) return;
    var dark = currentTheme() === 'dark';
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute('aria-label', dark ? '切换到浅色主题' : '切换到深色主题');
    btn.title = dark ? '浅色主题（T）' : '深色主题（T）';
  }

  function setTheme(t, persist) {
    doc.documentElement.setAttribute('data-theme', t);
    AVA.chart.invalidate();
    if (persist) ST.setTheme(t);
    paintThemeBtn();
    // 主题变了要重画曲线（颜色是从 CSS 变量读的）
    if (currentId === 'arena') AVA.views.arena.redraw();
  }

  function toggleTheme() { setTheme(currentTheme() === 'dark' ? 'light' : 'dark', true); }

  /* ============================ 路由 ============================ */

  function parse() {
    var h = String(root.location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    var id = parts[0] || 'arena';
    if (ORDER.indexOf(id) < 0) id = 'arena';
    var arg = parts[1] ? decodeURIComponent(parts[1]) : null;
    return { id: id, slug: arg };
  }

  function go(id, opts) {
    var hash = '#/' + id + (opts && opts.slug ? '/' + opts.slug : '');
    if (String(root.location.hash) === hash) apply(parse());
    else root.location.hash = hash;
  }

  function apply(route) {
    var v = AVA.views[route.id];
    if (!v) return;

    D.$$('.view').forEach(function (s) { s.classList.toggle('on', s.id === 'view-' + route.id); });
    D.$$('[data-v]').forEach(function (b) {
      b.setAttribute('aria-selected', String(b.dataset.v === route.id));
    });

    if (currentId && currentId !== route.id) {
      var prev = AVA.views[currentId];
      if (prev && prev.leave) prev.leave();
    }
    currentId = route.id;

    if (v.feed) v.feed();
    if (route.id === 'arena' && route.slug && S.byslug[route.slug]) AVA.views.arena.select(route.slug);
    if (route.id === 'arena') AVA.views.arena.redraw();

    doc.title = v.label + ' · 动物模仿大赛';
    root.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ============================ 音库 ============================ */

  function banner(msg) {
    var b = D.$('#appBanner');
    if (!b) return;
    if (!msg) { b.classList.remove('show'); b.innerHTML = ''; return; }
    b.innerHTML = IC('i-alert') + '<span>' + msg + '</span>';
    b.classList.add('show');
  }

  async function loadLibrary() {
    if (root.location.protocol === 'file:') {
      S.loading = false;
      banner('检测到你是直接双击打开 HTML 文件的。浏览器会拦截本地音频读取。' +
        '请在项目目录执行 <code>python tools/serve.js dist 8777</code>，' +
        '或直接访问已部署的线上地址。');
      AVA.views.arena.error('');
      return;
    }
    // 数据源自己会先探 /api/healthz：有后端就走 API，没有就退回静态
    // assets/credits.json。两种模式对视图代码是透明的。
    var modeUsed;
    try {
      modeUsed = await AVA.source.load();
    } catch (e) {
      S.loading = false;
      banner('音库读取失败（' + D.escapeHtml(e.message) + '）。' +
        '静态部署请先跑 <code>python tools/build_dist.py</code>；' +
        '用后端请先跑 <code>server/seed.js</code> 灌库。');
      AVA.views.arena.error('');
      return;
    }
    if (modeUsed === 'api') console.log('[AVA] 数据源：后端 API');
    else console.log('[AVA] 数据源：静态 credits.json（没探到后端，功能不受影响）');
    banner('');
    refreshChrome();
    AVA.views.arena.feed();
    AVA.views.codex.feed();

    // 首屏那次 apply() 跑在音库到位之前，route.slug 当时查不到动物就会被忽略。
    // 音库就绪后重跑一次路由，深链接 #/arena/<slug> 才真的生效。
    apply(parse());
  }

  /* ============================ 快捷键 ============================ */

  function typing(e) {
    var t = e.target;
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }

  function bindKeys() {
    D.on(doc, 'keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      var k = e.key;

      if (k === 't' || k === 'T') { toggleTheme(); return; }

      if (currentId !== 'arena') return;
      if (k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        if (S.animal && !S.busy) {
          if (S.recording) AVA.views.arena.stopRec();
          else AVA.views.arena.startRec();
        }
      } else if (k === 'r' || k === 'R') {
        e.preventDefault();
        AVA.views.arena.playRef();
      } else if (k === 'n' || k === 'N') {
        e.preventDefault();
        var randomBtn = D.$('#btnShuffle');
        if (randomBtn) randomBtn.click();
      }
    });
  }

  /* ============================ 启动 ============================ */

  function init() {
    ST.load();
    buildChrome();

    // 主题：head 里的内联脚本已经设过 data-theme，这里只补齐按钮状态
    if (!doc.documentElement.getAttribute('data-theme')) {
      setTheme('light', false);
    } else {
      paintThemeBtn();
    }

    ORDER.forEach(function (id) {
      var host = D.$('#view-' + id);
      if (host && AVA.views[id].mount) AVA.views[id].mount(host);
    });

    D.on(root, 'hashchange', function () { apply(parse()); });
    bindKeys();
    apply(parse());

    doc.body.classList.add('app-ready');
    loadLibrary();
  }

  AVA.app = {
    init: init,
    go: go,
    current: function () { return currentId; },
    refreshChrome: refreshChrome,
    banner: banner,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
  };

  // 测试环境（Node）里不要自动启动
  if (root.AVA_NOAUTO !== true) {
    if (doc.readyState === 'loading') D.on(doc, 'DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
