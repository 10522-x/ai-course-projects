/* =========================================================================
   ui/views/records.js · 战绩：汇总统计、评级分布、成就、最近记录
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  AVA.views = AVA.views || {};

  var D = AVA.dom, ST = AVA.store, SC = AVA.score;
  var S = ST.S;
  var IC = D.icon;

  var el = {};
  var mounted = false;

  function statCard(k, icon, v, unit, sub) {
    return '<div class="stat"><div class="k">' + IC(icon) + k + '</div>' +
      '<div class="v">' + v + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  }

  function boardHtml(data) {
    var rows = data.best.map(function (b, i) {
      return '<div class="tally-row">' +
        '<span class="g" style="background:var(--paper-3);color:var(--ink-2)">' + (i + 1) + '</span>' +
        '<span class="avatar avatar-sm" aria-hidden="true">' + b.emoji + '</span>' +
        '<span style="flex:1;min-width:0;font-weight:650">' + D.escapeHtml(b.cn) + '</span>' +
        '<span style="font-size:var(--t-xs);color:var(--muted-2)">' + D.fmt.when(b.at) + '</span>' +
        '<span class="c mono">' + b.total + '</span>' +
      '</div>';
    }).join('');
    return '<div class="blockhead"><h3>' + IC('i-trophy') + '全站最高分</h3>' +
      '<span class="note">来自后端数据库，跨设备汇总 · 共 ' + data.stats.runs + ' 次模仿</span></div>' +
      '<div class="panel panel-pad"><div class="tally">' + rows + '</div></div>';
  }

  /** API 模式下追加「全站最高分」板块。静态模式下整个板块不出现。 */
  function mountBoard() {
    if (!AVA.source || AVA.source.mode() !== 'api') return;
    AVA.source.leaderboard(8).then(function (data) {
      if (!data || !data.best || !data.best.length) return;
      var div = D.el('div');
      div.innerHTML = boardHtml(data);
      el.body.appendChild(div);
    });
  }

  function dataNote() {
    // 说明文案得跟实际数据行为一致：API 模式下成绩确实会报给服务端
    return (AVA.source && AVA.source.mode() === 'api')
      ? '本地记录存在浏览器里；成绩同时会上报服务端，用于全站榜单。'
      : '成绩、进度、成就全部存在本机浏览器，不上传、不联网。';
  }

  function render() {
    var st = ST.stats();

    /* ---- 还没玩过任何一次 ---- */
    if (!st.attempts) {
      el.body.innerHTML =
        '<div class="state">' +
          '<span class="state-ico">' + IC('i-chart') + '</span>' +
          '<h3>还没有任何记录</h3>' +
          '<p>去竞技场挑一只动物模仿一次，成绩、成就和进度都会汇总在这里。' + dataNote() + '</p>' +
          '<div class="state-actions">' +
            '<button class="btn btn-primary" id="goArena">' + IC('i-target') + '去竞技场</button>' +
          '</div>' +
        '</div>';
      var g = D.$('#goArena', el.body);
      if (g) g.onclick = function () { AVA.app.go('arena'); };
      mountBoard();
      return;
    }

    /* ---- 统计卡 ---- */
    var gradeOfBest = st.bestTotal ? SC.gradeOf(st.bestTotal) : '-';
    var html = '<div class="stat-grid">' +
      statCard('已挑战物种', 'i-target', st.played, '/ ' + st.species,
        '完成度 ' + D.fmt.pct(st.completion)) +
      statCard('累计模仿', 'i-mic', st.attempts, '次',
        st.played ? '平均每只 ' + (st.attempts / st.played).toFixed(1) + ' 次' : '') +
      statCard('单次最高分', 'i-trophy', st.bestTotal, '分', '等级 ' + gradeOfBest) +
      statCard('平均最高分', 'i-trend', st.bestAverage, '分',
        '已打分 ' + st.bestCount + ' 种') +
    '</div>';

    /* ---- 图鉴完成度 ---- */
    html += '<div class="blockhead"><h3>' + IC('i-flag') + '图鉴完成度</h3>' +
      '<span class="note">挑战过就算，不要求拿高分</span></div>' +
      '<div class="panel progress-card">' +
        '<div class="progress-hd"><span class="t">已挑战物种</span>' +
          '<span class="n">' + st.played + ' / ' + st.species + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.round(st.completion * 100) + '%"></i></div>' +
        '<div class="progress-meta"><span>听过原声 ' + st.listened + ' 种</span>' +
          '<span>还差 ' + Math.max(0, st.species - st.played) + ' 种就集齐</span></div>' +
      '</div>';

    /* ---- 评级分布 ---- */
    var maxTally = Math.max.apply(null, ['S', 'A', 'B', 'C', 'D'].map(function (k) { return st.tally[k]; }).concat([1]));
    html += '<div class="blockhead"><h3>' + IC('i-chart') + '评级分布</h3>' +
      '<span class="note">按每个物种的历史最高分统计</span></div>' +
      '<div class="panel panel-pad"><div class="tally">' +
      ['S', 'A', 'B', 'C', 'D'].map(function (g) {
        var n = st.tally[g];
        return '<div class="tally-row">' +
          '<span class="g" style="color:var(--grade-' + g.toLowerCase() + ');background:var(--grade-' + g.toLowerCase() + '-bg)">' + g + '</span>' +
          '<span class="bar"><i style="width:' + Math.round(n / maxTally * 100) + '%;background:var(--grade-' + g.toLowerCase() + ')"></i></span>' +
          '<span class="c">' + n + '</span>' +
        '</div>';
      }).join('') +
      '</div></div>';

    /* ---- 成就 ---- */
    var achs = ST.achievements();
    var got = achs.filter(function (a) { return a.got; }).length;
    html += '<div class="blockhead"><h3>' + IC('i-sparkle') + '成就</h3>' +
      '<span class="note">已解锁 ' + got + ' / ' + achs.length + '</span></div>' +
      '<div class="ach-grid">' + achs.map(function (a) {
        return '<div class="ach' + (a.got ? ' got' : '') + '">' +
          '<span class="ach-ico">' + IC(a.icon) + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div class="t">' + a.name + '</div>' +
            '<div class="d">' + a.desc + '</div>' +
            '<div class="p bar bar-thin"><i style="width:' + Math.round(a.pct * 100) + '%"></i></div>' +
            '<div class="d" style="margin-top:4px">' + a.cur + ' / ' + a.goal + '</div>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';

    /* ---- 最近记录 ---- */
    var recent = ST.recent(12);
    html += '<div class="blockhead"><h3>' + IC('i-list') + '最近成绩</h3>' +
      '<span class="note">点一行可以回去再挑战</span></div>' +
      '<div class="panel panel-pad"><div class="rec-list">' +
      recent.map(function (r) {
        var a = S.byslug[r.s];
        if (!a) return '';
        var g = SC.gradeOf(r.t);
        return '<button class="rec-row" data-slug="' + r.s + '">' +
          '<span class="avatar avatar-sm" aria-hidden="true">' + a.emoji + '</span>' +
          '<span class="nm">' + D.escapeHtml(a.cn) +
            '<small>' + D.fmt.when(r.at) + '</small></span>' +
          '<span class="tries">' + (ST.data.attempts[r.s] || 0) + ' 次</span>' +
          '<span class="badge" style="color:var(--grade-' + g.toLowerCase() +
            ');background:var(--grade-' + g.toLowerCase() + '-bg)">' + g + '</span>' +
          '<span class="sc" style="color:var(--grade-' + g.toLowerCase() + ')">' + r.t + '</span>' +
        '</button>';
      }).join('') +
      '</div></div>';

    /* ---- 危险区 ---- */
    html += '<div class="blockhead"><h3>' + IC('i-trash') + '数据管理</h3></div>' +
      '<div class="panel panel-pad" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        '<p class="prose" style="flex:1;min-width:220px;margin:0">全部成绩都保存在本机浏览器里。' +
        '换设备或清理浏览器数据会丢失，清空后无法恢复。</p>' +
        '<button class="btn btn-danger" id="recReset">' + IC('i-trash') + '清空全部记录</button>' +
      '</div>';

    el.body.innerHTML = html;

    D.$$('.rec-row', el.body).forEach(function (b) {
      b.onclick = function () { AVA.app.go('arena', { slug: b.dataset.slug }); };
    });
    D.$('#recReset', el.body).onclick = function () {
      if (!root.confirm('确定清空全部成绩、进度和成就吗？此操作无法撤销。')) return;
      ST.reset();
      AVA.app.refreshChrome();
      render();
      D.toast('记录已清空', 'ok');
    };
    mountBoard();
  }

  function mount(host) {
    if (mounted) return;
    mounted = true;
    host.innerHTML =
      '<div class="vhead"><div><h2>我的战绩</h2>' +
      '<p class="lead" id="recLead"></p></div></div>' +
      '<div id="recBody"></div>';
    el.body = D.$('#recBody', host);
    el.lead = D.$('#recLead', host);
  }

  function feed() {
    if (!mounted) return;
    if (el.lead) el.lead.textContent = dataNote();
    render();
  }

  AVA.views.records = {
    id: 'records', label: '战绩', icon: 'i-chart',
    mount: mount, feed: feed, render: render,
  };
})(typeof window !== 'undefined' ? window : globalThis);
