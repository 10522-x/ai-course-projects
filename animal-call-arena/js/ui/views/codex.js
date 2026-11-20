/* =========================================================================
   ui/views/codex.js · 图鉴：浏览全部物种、试听、看难度、进详情
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  AVA.views = AVA.views || {};

  var D = AVA.dom, A = AVA.audio, ST = AVA.store;
  var S = ST.S;
  var IC = D.icon;

  var el = {};
  var mounted = false;
  var view = { q: '', group: '全部', sort: '默认', onlyTodo: false };
  var drawer = { animal: null, handle: null, open: false };

  var SORTS = {
    '默认': null,
    '难度': function (a, b) { return ST.difficulty(b) - ST.difficulty(a); },
    '最高分': function (a, b) {
      var x = ST.data.best[a.slug] === undefined ? -1 : ST.data.best[a.slug];
      var y = ST.data.best[b.slug] === undefined ? -1 : ST.data.best[b.slug];
      return y - x;
    },
    '时长': function (a, b) { return b.clipDuration - a.clipDuration; },
    '跨度': function (a, b) { return b.pitchSpan - a.pitchSpan; },
  };

  /* ============================ 列表 ============================ */

  function filtered() {
    var q = view.q.trim().toLowerCase();
    var list = S.lib.filter(function (a) {
      if (view.group !== '全部' && a.group !== view.group) return false;
      if (view.onlyTodo && ST.data.attempts[a.slug]) return false;
      if (!q) return true;
      return (a.cn + ' ' + a.common + ' ' + a.sci + ' ' + a.hint + ' ' + a.group)
        .toLowerCase().indexOf(q) >= 0;
    });
    var cmp = SORTS[view.sort];
    if (cmp) list = list.slice().sort(cmp);
    return list;
  }

  function cardHtml(a) {
    var best = ST.data.best[a.slug];
    var tries = ST.data.attempts[a.slug] || 0;
    var diff = ST.difficulty(a);
    return '<button class="card" data-slug="' + a.slug + '">' +
      (best !== undefined && best >= 88 ? '<span class="card-flag">' + IC('i-check') + '</span>' : '') +
      '<div class="card-top">' +
        '<span class="avatar' + (tries ? ' played' : '') + '" aria-hidden="true">' + a.emoji + '</span>' +
        '<span class="card-title">' +
          '<span class="cn">' + D.escapeHtml(a.cn) + '</span>' +
          '<span class="sci">' + D.escapeHtml(a.sci) + '</span>' +
        '</span>' +
      '</div>' +
      '<p class="card-hint">' + D.escapeHtml(a.hint) + '</p>' +
      '<div class="card-foot">' +
        '<span class="diff" data-level="' + diff + '" title="难度 ' + diff + '/4（' +
          ST.DIFF_LABEL[diff] + '）· 相对整个音库而言">' +
          '<span></span><span></span><span></span><span></span></span>' +
        '<span>' + a.group + '</span>' +
        '<span class="spacer"></span>' +
        (best !== undefined
          ? '<span class="card-best">' + best + '<span class="of">/100</span></span>'
          : '<span class="badge">未挑战</span>') +
      '</div>' +
    '</button>';
  }

  function renderList() {
    var list = filtered();
    var note = '共 ' + S.lib.length + ' 种';
    if (view.group !== '全部') note = view.group + ' ' + S.lib.filter(function (a) { return a.group === view.group; }).length + ' 种';
    if (list.length !== S.lib.length) note = '筛选出 ' + list.length + ' 种';
    el.count.innerHTML = note +
      (view.q ? ' · 关键词「' + D.escapeHtml(view.q) + '」' : '');

    if (!list.length) {
      el.grid.innerHTML = '';
      el.empty.hidden = false;
      return;
    }
    el.empty.hidden = true;
    el.grid.innerHTML = list.map(cardHtml).join('');
    D.$$('.card', el.grid).forEach(function (c) {
      c.onclick = function () { openDetail(c.dataset.slug); };
    });
  }

  function renderChips() {
    var groups = ['全部'].concat(
      S.lib.map(function (a) { return a.group; })
        .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
    );
    el.groups.innerHTML = groups.map(function (g) {
      var n = g === '全部' ? S.lib.length : S.lib.filter(function (a) { return a.group === g; }).length;
      return '<button class="chip" data-g="' + g + '" aria-pressed="' + (view.group === g) + '">' +
        g + '<span class="n">' + n + '</span></button>';
    }).join('');
    D.$$('.chip', el.groups).forEach(function (b) {
      b.onclick = function () { view.group = b.dataset.g; renderChips(); renderList(); };
    });

    el.sorts.innerHTML = Object.keys(SORTS).map(function (s) {
      return '<button class="chip" data-s="' + s + '" aria-pressed="' + (view.sort === s) + '">' + s + '</button>';
    }).join('') +
      '<button class="chip" data-todo="1" aria-pressed="' + view.onlyTodo + '">' +
      IC('i-target') + '只看没挑战的</button>';
    D.$$('.chip', el.sorts).forEach(function (b) {
      b.onclick = function () {
        if (b.dataset.todo) view.onlyTodo = !view.onlyTodo;
        else view.sort = b.dataset.s;
        renderChips(); renderList();
      };
    });
  }

  /* ============================ 详情抽屉 ============================ */

  function detailHtml(a) {
    var best = ST.data.best[a.slug];
    var tries = ST.data.attempts[a.slug] || 0;
    var diff = ST.difficulty(a);
    var row = function (k, v, monoCls) {
      return '<div><dt>' + k + '</dt><dd' + (monoCls ? ' class="mono"' : '') + '>' + v + '</dd></div>';
    };
    return '<div class="panel-head" style="border:0;padding:0 0 14px">' +
        '<span class="avatar avatar-lg' + (tries ? ' played' : '') + '">' + a.emoji + '</span>' +
        '<span class="t"><h3>' + D.escapeHtml(a.cn) + '</h3>' +
        '<span class="sci">' + D.escapeHtml(a.sci) + '</span></span>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px">' +
        '<span class="badge badge-brand">' + a.group + '</span>' +
        '<span class="badge">' + IC('i-ruler') + '难度 ' + diff + '/4 ' + ST.DIFF_LABEL[diff] + '</span>' +
        (best !== undefined ? '<span class="badge badge-good">' + IC('i-trophy') + '最高 ' + best + '</span>' : '') +
      '</div>' +
      '<div class="hint" style="margin-bottom:18px">' + IC('i-note') + '<span>' + D.escapeHtml(a.hint) + '</span></div>' +
      '<div class="dl">' +
        row('片段时长', D.fmt.sec(a.clipDuration)) +
        row('音高跨度', (a.pitchSpan || 0).toFixed(1) + ' 半音', true) +
        row('中位频率', Math.round(a.clipMedianHz || 0) + ' Hz', true) +
        row('有声密度', D.fmt.pct(a.density || 0), true) +
        row('录音清晰度', D.fmt.pct(a.clarity || 0), true) +
        row('我的尝试', tries ? tries + ' 次' : '还没试过') +
      '</div>' +
      '<div class="blockhead"><h3>' + IC('i-database') + '素材来源</h3></div>' +
      '<div class="dl">' +
        row('录音师', D.escapeHtml(a.recordist || '佚名')) +
        row('许可证', D.escapeHtml(D.fmt.lic(a.license))) +
        row('原始录音', '<a href="' + a.source + '" target="_blank" rel="noopener">XC' + a.xcid + '</a>') +
        row('全长', D.fmt.sec(a.fullLength) + '（本站只播 ' + a.clipStart.toFixed(1) + '-' + a.clipEnd.toFixed(1) + 's）') +
      '</div>';
  }

  async function openDetail(slug) {
    var a = S.byslug[slug];
    if (!a) return;
    drawer.animal = a;
    drawer.open = true;
    el.drawerBody.innerHTML = detailHtml(a);
    el.drawerFoot.innerHTML =
      '<button class="btn" id="dPreview">' + IC('i-play') + '试听原声</button>' +
      '<button class="btn btn-primary" id="dGo" style="flex:1">' + IC('i-mic') + '去挑战</button>';
    el.scrim.classList.add('on');
    el.drawer.classList.add('on');
    ST.markListened(slug);

    D.$('#dPreview', el.drawerFoot).onclick = function () { previewSample(a); };
    D.$('#dGo', el.drawerFoot).onclick = function () {
      closeDetail();
      AVA.app.go('arena', { slug: slug });
    };
  }

  function closeDetail() {
    drawer.open = false;
    drawer.animal = null;
    el.scrim.classList.remove('on');
    el.drawer.classList.remove('on');
    if (drawer.handle) { drawer.handle.stop(); drawer.handle = null; }
  }

  async function previewSample(a) {
    var btn = D.$('#dPreview', el.drawerFoot);
    if (drawer.handle) {
      drawer.handle.stop();
      drawer.handle = null;
      btn.innerHTML = IC('i-play') + '试听原声';
      return;
    }
    btn.innerHTML = IC('i-stop') + '停止';
    try {
      var buf = await A.decode(a);
      var t0 = Math.max(0, a.clipStart);
      var t1 = Math.min(buf.duration, a.clipEnd);
      drawer.handle = A.play(buf, t0, t1 - t0, function (p) {
        if (p >= 1) { drawer.handle = null; btn.innerHTML = IC('i-play') + '试听原声'; }
      });
    } catch (e) {
      btn.innerHTML = IC('i-play') + '试听原声';
      D.toast('试听失败：' + e.message, 'bad');
    }
  }

  /* ============================ 挂载 ============================ */

  function mount(host) {
    if (mounted) return;
    mounted = true;

    host.innerHTML =
      '<div class="vhead">' +
        '<div><h2>物种图鉴</h2>' +
        '<p class="lead">音库载入中…</p></div>' +
      '</div>' +
      '<div class="searchbar">' +
        '<label class="field">' + IC('i-search') +
          '<input id="cxQ" type="search" placeholder="搜索中文名、英文名、学名或叫声描述" aria-label="搜索物种">' +
          '<button class="clear" id="cxClear" hidden aria-label="清空">' + IC('i-close') + '</button>' +
        '</label>' +
      '</div>' +
      '<div class="codex-tabs">' +
        '<div class="chips" id="cxGroups" style="margin-bottom:8px"></div>' +
        '<div class="chips" id="cxSorts"></div>' +
      '</div>' +
      '<p class="count-note" id="cxCount"></p>' +
      '<div class="grid-lib" id="cxGrid"></div>' +
      '<div class="state" id="cxEmpty" hidden>' +
        '<span class="state-ico">' + IC('i-search') + '</span>' +
        '<h3>没有匹配的物种</h3>' +
        '<p>换个关键词，或把筛选条件放宽一点。</p>' +
        '<div class="state-actions"><button class="btn" id="cxReset">' + IC('i-refresh') + '重置筛选</button></div>' +
      '</div>' +
      '<div class="scrim" id="cxScrim"></div>' +
      '<aside class="drawer" id="cxDrawer" role="dialog" aria-modal="true" aria-label="物种详情">' +
        '<div class="drawer-body" id="cxDrawerBody"></div>' +
        '<div class="drawer-foot" id="cxDrawerFoot"></div>' +
      '</aside>';

    el.q = D.$('#cxQ', host);
    el.clear = D.$('#cxClear', host);
    el.groups = D.$('#cxGroups', host);
    el.sorts = D.$('#cxSorts', host);
    el.count = D.$('#cxCount', host);
    el.grid = D.$('#cxGrid', host);
    el.empty = D.$('#cxEmpty', host);
    el.scrim = D.$('#cxScrim', host);
    el.drawer = D.$('#cxDrawer', host);
    el.drawerBody = D.$('#cxDrawerBody', host);
    el.drawerFoot = D.$('#cxDrawerFoot', host);

    el.q.oninput = function () {
      view.q = el.q.value;
      el.clear.hidden = !view.q;
      renderList();
    };
    el.clear.onclick = function () {
      view.q = ''; el.q.value = ''; el.clear.hidden = true; renderList(); el.q.focus();
    };
    D.$('#cxReset', host).onclick = function () {
      view.q = ''; el.q.value = ''; el.clear.hidden = true;
      view.group = '全部'; view.onlyTodo = false;
      renderChips(); renderList();
    };
    el.scrim.onclick = closeDetail;
    D.on(root.document, 'keydown', function (e) {
      if (e.key === 'Escape' && drawer.open) closeDetail();
    });
  }

  function feed() {
    if (!mounted) return;
    var head = D.$('.vhead .lead', D.$('#view-codex'));
    if (head) {
      var st = ST.stats();
      head.textContent = '音库共 ' + st.species + ' 种，全部来自 xeno-canto 的真实野外录音。' +
        '点任意一张卡片看详情、试听原声，或直接去挑战。';
    }
    renderChips();
    renderList();
  }

  AVA.views.codex = {
    id: 'codex', label: '图鉴', icon: 'i-grid',
    mount: mount, feed: feed,
    openDetail: openDetail, closeDetail: closeDetail,
    leave: closeDetail,
  };
})(typeof window !== 'undefined' ? window : globalThis);
