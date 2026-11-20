/* =========================================================================
   ui/views/about.js · 关于：玩法原理、打分模型、素材许可、技术说明
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

  function licenseTally() {
    var map = {};
    S.lib.forEach(function (a) {
      var name = D.fmt.lic(a.license);
      map[name] = (map[name] || 0) + 1;
    });
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; })
      .map(function (k) { return { name: k, n: map[k] }; });
  }

  function isNonCommercial(a) {
    return /-nc/.test(a.license || '') || /\/by-nc/.test(a.license || '');
  }

  function render() {
    var st = ST.stats();
    var rows = [
      ['音准准确度', SC.WEIGHTS.pitch],
      ['节奏时长', SC.WEIGHTS.rhythm],
      ['音高走向', SC.WEIGHTS.shape],
      ['稳定完成度', SC.WEIGHTS.stability],
    ];
    var nc = S.lib.filter(isNonCommercial).length;

    el.body.innerHTML =
      '<div class="about-grid">' +

        /* ---- 玩法 ---- */
        '<section class="panel panel-pad doc">' +
          '<h3>' + IC('i-target') + '这个站点怎么玩</h3>' +
          '<p>选一只动物，先听它真实的野外录音，然后对着麦克风模仿它。系统录下你的声音，' +
          '把两条声音各自抽象成「音高随时间变化的曲线」，逐点比对，给出音准、节奏、走向、稳定度四个维度的分数。</p>' +
          '<p>难点从来不是播放和录音，而是<b>怎么判断「像不像」</b>。把声音压成一条曲线再比对，' +
          '这一步做对了，整个评分才立得住。</p>' +
          '<p>图鉴里的<b>难度不是人工标注的</b>，而是由每条录音的音高跨度、片段时长和发声密度算出来，' +
          '再在整个音库内部按分位切成四档。所以它说的是「在这套音库里相对有多难」，' +
          '以后加了新物种，四档会自动重新划分。</p>' +
        '</section>' +

        /* ---- 理解难度的关键 ---- */
        '<section class="panel panel-pad doc">' +
          '<h3>' + IC('i-waves') + '唱不上去也不吃亏</h3>' +
          '<p>人和动物的音域差得很远。所以比对之前，两条曲线会<b>各自减去自己的中位数音高</b>，' +
          '变成「相对音高」再比。你只需要把高低起伏的形状模仿对，不用真的叫到那个频率上。</p>' +
          '<p>实测低八度、高八度模仿都能拿到接近满分。这是有意设计成这样的。</p>' +
        '</section>' +
      '</div>' +

      /* ---- 打分模型 ---- */
      '<div class="blockhead"><h3>' + IC('i-chart') + '打分模型</h3>' +
        '<span class="note">总分 = 四个维度的加权和</span></div>' +
      '<div class="about-grid">' +
        '<section class="panel panel-pad">' +
          '<div class="weights">' +
            rows.map(function (r) {
              return '<div class="wrow"><span class="n">' + r[0] + '</span>' +
                '<span class="bar"><i style="width:' + Math.round(r[1] * 100) + '%"></i></span>' +
                '<span class="p">' + Math.round(r[1] * 100) + '%</span></div>';
            }).join('') +
          '</div>' +
          '<p class="prose" style="margin-top:18px;font-size:var(--t-sm)">' +
            '等级划分：S ≥ 88，A ≥ 76，B ≥ 62，C ≥ 45，其余为 D。</p>' +
        '</section>' +
        '<section class="panel panel-pad doc">' +
          '<h3>' + IC('i-trend') + '每个维度在算什么</h3>' +
          '<p><b>音准</b>：' + SC.RULES.pitch + '</p>' +
          '<p><b>节奏</b>：' + SC.RULES.rhythm + '</p>' +
          '<p><b>走向</b>：' + SC.RULES.shape + '</p>' +
          '<p><b>稳定</b>：' + SC.RULES.stability + '</p>' +
        '</section>' +
      '</div>' +

      /* ---- 数据来源 ---- */
      '<div class="blockhead"><h3>' + IC('i-database') + '素材来源与许可</h3>' +
        '<span class="note">' + st.species + ' 条录音，逐条署名</span></div>' +
      '<section class="panel panel-pad">' +
        '<div class="dl">' +
          licenseTally().map(function (l) {
            return '<div><dt>' + l.name + '</dt><dd class="mono">' + l.n + ' 条</dd></div>';
          }).join('') +
        '</div>' +
        '<p class="prose" style="margin-top:16px">全部音频来自开源声库 ' +
          '<a href="https://xeno-canto.org" target="_blank" rel="noopener">xeno-canto.org</a>，' +
          '每条录音的录音师、许可证和原始链接都保留在页面的署名行与 <code>assets/credits.json</code> 里。</p>' +
        (nc ? '<div class="licnote" style="margin-top:16px">' + IC('i-alert') +
          '<span>其中 <b>' + nc + ' 条</b>是「非商业使用」许可。个人练习、学习、非商业演示都没有问题；' +
          '若要上线并变现，需要逐条替换为可商用的素材。</span></div>' : '') +
      '</section>' +

      /* ---- 技术 ---- */
      '<div class="blockhead"><h3>' + IC('i-keyboard') + '技术说明与快捷键</h3></div>' +
      '<div class="about-grid">' +
        '<section class="panel panel-pad doc">' +
          '<h3>' + IC('i-info') + '零依赖、零构建</h3>' +
          '<p>整个前端没有任何第三方库，没有框架，没有构建步骤。源码就是产物，' +
          '丢到任意静态托管上就能跑，不需要服务器和数据库。</p>' +
          '<p>所有信号处理都是手写的：约 25 行的 <b>radix-2 FFT</b>、' +
          '<b>McLeod 基频检测</b>（MPM）、<b>带约束的 DTW</b> 与皮尔逊相关。' +
          '音频片段在离线阶段由工具链挑好，浏览器只负责轻量计算。</p>' +
        '</section>' +
        '<section class="panel panel-pad doc">' +
          '<h3>' + IC('i-ruler') + '键盘快捷键</h3>' +
          '<div class="keys">' +
            '<div><span>开始 / 结束模仿</span><kbd>空格</kbd></div>' +
            '<div><span>播放 / 停止原声</span><kbd>R</kbd></div>' +
            '<div><span>随机换一只动物</span><kbd>N</kbd></div>' +
            '<div><span>切换主题</span><kbd>T</kbd></div>' +
            '<div><span>关闭详情抽屉</span><kbd>Esc</kbd></div>' +
          '</div>' +
          '<p class="prose" style="margin-top:16px;font-size:var(--t-sm)">' +
            '录音时请戴耳机，并让麦克风离嘴 15-25 cm，环境越安静越准。' +
            '如果用的是外放，原声会被一起录进去。</p>' +
        '</section>' +
      '</div>' +

      /* ---- 限制 ---- */
      '<div class="blockhead"><h3>' + IC('i-alert') + '已知限制</h3></div>' +
      '<section class="panel panel-pad doc">' +
        '<p><b>短促高频的叫声不好学。</b>80 毫秒级别的短音（小鸟、青蛙一类），分析窗的时间分辨率不够，曲线会偏糊。这是物理限制。</p>' +
        '<p><b>极低频覆盖不到。</b>检测范围设在 70-3000 Hz，大象的次声波（低于 20 Hz）不在范围内，所以没有收录。</p>' +
        '<p><b>个别录音仍有零星毛刺。</b>26 条里有少数几条存在个别的八度跳变，不影响使用，但在曲线上能看出来。</p>' +
      '</section>';
  }

  function mount(host) {
    if (mounted) return;
    mounted = true;
    host.innerHTML =
      '<div class="vhead"><div><h2>关于这个项目</h2>' +
      '<p class="lead">一个零依赖、零后端的纯静态网页应用。算法、数据来源和已知限制都写在这里。</p></div></div>' +
      '<div id="aboutBody"></div>';
    el.body = D.$('#aboutBody', host);
  }

  function feed() { if (mounted) render(); }

  AVA.views.about = {
    id: 'about', label: '关于', icon: 'i-info',
    mount: mount, feed: feed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
