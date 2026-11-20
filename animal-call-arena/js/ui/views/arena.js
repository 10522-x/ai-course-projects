/* =========================================================================
   ui/views/arena.js · 竞技场：选对手 → 听原声 → 模仿 → 拿分
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  AVA.views = AVA.views || {};

  var D = AVA.dom, P = AVA.pitch, A = AVA.audio, SC = AVA.score, ST = AVA.store;
  var S = ST.S;
  var IC = D.icon;

  var el = {};            // 本视图的 DOM 引用
  var mounted = false;
  var rafRec = 0;
  var takePlayer = null;

  /* ============================ 渲染片段 ============================ */

  function pickerHtml() {
    var groups = {};
    S.lib.forEach(function (a) { (groups[a.group] = groups[a.group] || []).push(a); });
    var order = ['鸟类', '哺乳类', '两栖类'];
    var keys = order.filter(function (k) { return groups[k]; })
      .concat(Object.keys(groups).filter(function (k) { return order.indexOf(k) < 0; }));

    return keys.map(function (g) {
      var chips = groups[g].map(function (a) {
        var b = ST.data.best[a.slug];
        var on = S.animal && S.animal.slug === a.slug;
        return '<button class="pchip" data-slug="' + a.slug + '" aria-pressed="' + (on ? 'true' : 'false') + '"' +
          (ST.data.attempts[a.slug] ? ' title="已尝试 ' + ST.data.attempts[a.slug] + ' 次"' : '') + '>' +
          '<span class="avatar" aria-hidden="true">' + a.emoji + '</span>' +
          '<span>' + D.escapeHtml(a.cn) + '</span>' +
          (b !== undefined ? '<span class="pbest">' + b + '</span>' : '') +
          '</button>';
      }).join('');
      return '<div class="picker-row"><span class="rowlabel">' + g + '</span><div class="strip">' + chips + '</div></div>';
    }).join('');
  }

  function rivalHtml() {
    var a = S.animal;
    if (!a) {
      return '<span class="avatar avatar-lg" aria-hidden="true">?</span>' +
        '<div class="who"><h2>先挑一个对手</h2>' +
        '<p class="lead" style="margin-top:5px">从上面任意一组里点一只动物。想看清全部 26 种，去「图鉴」。</p></div>';
    }
    var diff = ST.difficulty(a);
    var best = ST.data.best[a.slug];
    return '<span class="avatar avatar-lg' + (best !== undefined ? ' played' : '') + '" aria-hidden="true">' + a.emoji + '</span>' +
      '<div class="who">' +
        '<h2>' + D.escapeHtml(a.cn) +
          '<span class="badge">' + D.escapeHtml(a.common) + '</span>' +
          '<span class="badge badge-mono">' + diff + '/4 ' + ST.DIFF_LABEL[diff] + '</span>' +
        '</h2>' +
        '<div class="sci">' + D.escapeHtml(a.sci) + '</div>' +
        '<div class="tags">' +
          '<span class="badge badge-ref">' + IC('i-clock') + D.fmt.sec(a.clipDuration) + '</span>' +
          '<span class="badge">' + IC('i-trend') + '跨度 ' + (a.pitchSpan || 0).toFixed(1) + ' 半音</span>' +
          '<span class="badge">' + IC('i-ruler') + '中位 ' + Math.round(a.clipMedianHz || 0) + ' Hz</span>' +
          (best !== undefined ? '<span class="badge badge-good">' + IC('i-trophy') + '最高 ' + best + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="actions">' +
        '<button class="btn" id="btnShuffle">' + IC('i-refresh') + '随机换一只</button>' +
        '<button class="btn" id="btnDetail">' + IC('i-info') + '物种详情</button>' +
      '</div>';
  }

  function scoreEmptyHtml() {
    return '<div class="state">' +
      '<span class="state-ico">' + IC('i-chart') + '</span>' +
      '<h3>还没有成绩</h3>' +
      '<p>点「开始模仿」，录一段你的叫声，这里会从音准、节奏、走向、稳定度四个维度给你打分。</p>' +
      '</div>';
  }

  function scoreHtml(r) {
    var g = SC.gradeOf(r.total);
    var dim = function (name, weight, val, color, fb) {
      return '<div class="dim">' +
        '<div class="dim-hd"><span class="n">' + name + '<em>' + weight + '</em></span>' +
        '<span class="s" style="color:' + color + '">' + Math.round(val) + '</span></div>' +
        '<div class="bar"><i data-w="' + Math.round(val) + '" style="background:' + color + '"></i></div>' +
        '<div class="dim-fb">' + fb + '</div></div>';
    };
    var w = function (k) { return Math.round(SC.WEIGHTS[k] * 100) + '%'; };
    var color = {
      pitch: 'var(--brand)', rhythm: 'var(--ref)',
      shape: 'var(--grade-s)', stability: 'var(--grade-b)',
    };

    return '<div class="total">' +
        '<span class="num" id="totalNum" style="color:var(--grade-' + g.toLowerCase() + ')">0</span>' +
        '<span class="grade" id="totalGrade" style="color:var(--grade-' + g.toLowerCase() +
          ');background:var(--grade-' + g.toLowerCase() + '-bg)">' + g + '</span>' +
        '<span class="of">/ 100</span>' +
      '</div>' +
      '<p class="verdict">' + SC.VERDICT[g] + '</p>' +
      '<div class="dims">' +
        dim('音准准确度', w('pitch'), r.pitchScore, color.pitch, r.fb.pitch) +
        dim('节奏时长', w('rhythm'), r.rhythmScore, color.rhythm, r.fb.rhythm) +
        dim('音高走向', w('shape'), r.shapeScore, color.shape, r.fb.shape) +
        dim('稳定完成度', w('stability'), r.stabilityScore, color.stability, r.fb.stability) +
      '</div>' +
      '<div class="summary-note" id="deltaNote"></div>' +
      '<div class="mini">' +
        '<button class="btn btn-sm" id="mAgain">' + IC('i-refresh') + '再来一次</button>' +
        '<button class="btn btn-sm" id="mRef">' + IC('i-volume') + '再听原声</button>' +
        '<button class="btn btn-sm" id="mShare">' + IC('i-share') + '存成绩图</button>' +
      '</div>';
  }

  /* ============================ 计分卡动画 ============================ */

  function animateScore(r) {
    var card = el.score;
    card.innerHTML = scoreHtml(r);
    var numEl = D.$('#totalNum', card);
    var bars = D.$$('.bar > i', card);

    if (D.prefersReduced()) {
      numEl.textContent = r.total;
      bars.forEach(function (b) { b.style.width = b.dataset.w + '%'; });
    } else {
      var t0 = 0, dur = 780;
      var step = function (ts) {
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        var e = 1 - Math.pow(1 - k, 3);
        numEl.textContent = Math.round(r.total * e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      requestAnimationFrame(function () {
        bars.forEach(function (b) { b.style.width = b.dataset.w + '%'; });
      });
    }

    var note = D.$('#deltaNote', card);
    var st = ST.stats();
    var prev = ST.data.best[S.animal.slug];
    var parts = [];
    parts.push('你已挑战 <b>' + st.played + '/' + st.species + '</b> 种，累计 ' + st.attempts + ' 次模仿。');
    if (st.bestCount) parts.push('已打分物种的平均最高分 <b>' + st.bestAverage + '</b>。');
    note.innerHTML = parts.join(' ');

    D.$('#mAgain', card).onclick = function () { startRec(); };
    D.$('#mRef', card).onclick = function () { playRef(); };
    D.$('#mShare', card).onclick = function () { saveShareImage(r); };
  }

  /* ============================ 状态同步 ============================ */

  function redraw(progress) {
    if (!el.cv) return;
    AVA.chart.draw(el.cv, {
      ref: S.ref,
      refPeaks: S.refPeaks,
      userVals: S.userVals,
      userTimes: S.userTimes,
      progress: typeof progress === 'number' ? progress : null,
      empty: S.loading ? '正在载入音库…'
        : !S.animal ? '先在上面选一只动物'
        : '这条录音没有可用的音高曲线',
    });
  }

  function refreshRival() {
    el.rival.innerHTML = rivalHtml();
    var sh = D.$('#btnShuffle', el.rival);
    if (sh) sh.onclick = randomPick;
    var dt = D.$('#btnDetail', el.rival);
    if (dt) dt.onclick = function () { if (S.animal) AVA.views.codex.openDetail(S.animal.slug); };
  }

  function refreshPicker() {
    el.picker.innerHTML = '<p class="blockhead" style="margin:0 0 8px"><h3 style="font-size:var(--t-md)">' +
      IC('i-target') + '选择你的对手</h3><span class="note" id="pickerNote"></span></p>' + pickerHtml();
    var note = D.$('#pickerNote', el.picker);
    if (note) {
      var st = ST.stats();
      note.textContent = '已挑战 ' + st.played + '/' + st.species + ' 种';
    }
    D.$$('.pchip', el.picker).forEach(function (b) {
      b.onclick = function () { select(b.dataset.slug); };
    });
    var active = D.$('.pchip[aria-pressed="true"]', el.picker);
    if (active && active.scrollIntoView) {
      try { active.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* 老浏览器忽略 */ }
    }
  }

  function setBusy(on, label) {
    S.busy = on;
    D.$$('.pchip', el.picker).forEach(function (b) { b.disabled = on; });
    if (on) veil(label || '处理中…', 'load');
    else veilOff();
  }

  /* ---------------- 覆盖层 ---------------- */
  function veil(text, kind, num) {
    if (!el.veil) return;
    if (kind === 'count') {
      el.veil.innerHTML =
        '<div class="ring"><svg viewBox="0 0 108 108" aria-hidden="true">' +
        '<circle class="track" cx="54" cy="54" r="48"></circle>' +
        '<circle class="prog" id="ringProg" cx="54" cy="54" r="48" ' +
        'stroke-dasharray="301.6" stroke-dashoffset="0"></circle></svg>' +
        '<span class="num" id="ringNum">3</span></div>' +
        '<div class="vtxt">' + D.escapeHtml(text) + '</div>';
    } else if (kind === 'load') {
      el.veil.innerHTML = '<div class="loadline"><i></i></div><div class="vtxt">' + D.escapeHtml(text) + '</div>';
    } else {
      el.veil.innerHTML = '<div class="vtxt">' + D.escapeHtml(text) + '</div>';
    }
    el.veil.classList.add('on');
  }
  function veilOff() { if (el.veil) el.veil.classList.remove('on'); }

  /* ============================ 选中动物 ============================ */

  async function select(slug) {
    if (S.recording || S.busy) return;
    var a = S.byslug[slug];
    if (!a) return;

    S.animal = a;
    S.userVals = null; S.userTimes = null; S.score = null;
    S.playProgress = null;
    ST.data.lastSlug = slug; ST.save();
    ST.markListened(slug);

    refreshRival();
    refreshPicker();
    el.hint.innerHTML = IC('i-note') + '<span><b>怎么叫：</b>' + D.escapeHtml(a.hint) + '</span>';
    el.hint.style.display = 'flex';
    el.credit.innerHTML = '';
    el.take.hidden = true;
    el.btnPlay.disabled = true;
    el.btnRec.disabled = true;
    el.score.innerHTML = '<div class="state"><span class="state-ico">' + IC('i-mic') + '</span>' +
      '<h3>准备好了</h3><p>先点「听原声」熟悉调子，再点「开始模仿」。</p></div>';
    redraw();

    setBusy(true, '正在解码真实录音…');
    try {
      var buf = await A.decode(a);
      S.buffer = buf;
      S.pcm = null;
      var t0 = Math.max(0, a.clipStart), t1 = Math.min(buf.duration, a.clipEnd);
      S.clipT0 = t0; S.clipT1 = t1; S.clipDur = t1 - t0;

      // API 模式下服务端已经把基准曲线和波形算好存进库了，直接拿来用：
      // 手机上选中一只动物时省掉「解码后逐帧提曲线」这一整段 CPU。
      var d = await AVA.source.detail(a.slug);
      if (d && d.contourAvailable && d.refVals && d.refVals.length > 4 &&
          d.refTimes && d.refTimes.length === d.refVals.length) {
        var rd = d.refDur || (d.refTimes[d.refTimes.length - 1] - d.refTimes[0]);
        S.ref = { vals: d.refVals, times: d.refTimes, dur: rd, voicedRatio: d.refVoiced || 0 };
        S.refPeaks = d.refPeaks;
      } else {
        // 静态模式：自己在浏览器里把曲线提出来（老路径，口径完全一致）
        S.pcm = P.mixToMono(buf);
        var frames = P.pcmFrames(S.pcm, buf.sampleRate, t0, t1);
        var c = P.contourOf(frames);
        if (!c) throw new Error('这段录音里没有检测到清晰的音高');
        // dur 取"有声段"的跨度，而不是整段 clip，这样和用户侧的口径一致
        //（否则用户起手慢半秒就会被当成节奏错误）
        var spanDur = c.times[c.times.length - 1] - c.times[0];
        S.ref = { vals: c.vals, times: c.times, dur: spanDur, voicedRatio: c.voicedRatio };
        S.refPeaks = P.peaksOf(S.pcm, buf.sampleRate, t0, t1, 220);
      }

      el.credit.innerHTML = IC('i-database') +
        '<span>原声 <a href="' + a.source + '" target="_blank" rel="noopener">XC' + a.xcid + '</a> · ' +
        D.escapeHtml(a.recordist || '佚名') + '<span class="badge" style="margin:0 4px">' +
        D.escapeHtml(D.fmt.lic(a.license)) + '</span>片段 ' + t0.toFixed(1) + '-' + t1.toFixed(1) +
        's（全长 ' + a.fullLength.toFixed(1) + 's）</span>';

      el.btnPlay.disabled = false;
      el.btnRec.disabled = false;
    } catch (e) {
      S.ref = null; S.buffer = null;
      banner('加载「' + D.escapeHtml(a.cn) + '」失败：' + D.escapeHtml(e.message));
      D.toast('这条录音加载失败了，换一只试试', 'bad');
    } finally {
      setBusy(false);
      redraw();
    }
  }

  function randomPick() {
    if (!S.lib.length || S.busy || S.recording) return;
    var pool = S.lib.filter(function (a) { return !S.animal || a.slug !== S.animal.slug; });
    var next = pool[Math.floor(Math.random() * pool.length)];
    if (next) select(next.slug);
  }

  /* ============================ 播放原声 ============================ */

  var playHandle = null;
  function playRef() {
    if (!S.buffer) return;
    if (playHandle) { playHandle.stop(); playHandle = null; el.btnPlay.innerHTML = IC('i-play') + '听原声'; }
    else {
      el.btnPlay.innerHTML = IC('i-stop') + '停一下';
      playHandle = A.play(S.buffer, S.clipT0, S.clipT1 - S.clipT0, function (p) {
        if (p >= 1) { playHandle = null; el.btnPlay.innerHTML = IC('i-play') + '听原声'; }
        redraw(p >= 1 ? null : p);
      });
    }
  }
  function stopRef() {
    A.stop();
    playHandle = null;
    if (el.btnPlay) el.btnPlay.innerHTML = IC('i-play') + '听原声';
    redraw();
  }

  /* ============================ 录音 ============================ */

  function closeAllPlayback() {
    stopRef();
    if (takePlayer) { takePlayer.pause(); takePlayer = null; }
    if (el.btnTake) el.btnTake.innerHTML = IC('i-headphones') + '回听我的';
  }

  async function startRec() {
    if (!S.animal || S.recording || S.busy) return;
    if (!S.ref) { D.toast('原声还没准备好，稍等一下', 'warn'); return; }
    closeAllPlayback();

    try { await A.openMic(); }
    catch (e) {
      banner('拿不到麦克风权限。请在浏览器地址栏允许本站访问麦克风；' +
        '如果是以 file:// 直接打开的页面，请改用本地服务器访问。');
      D.toast('无法访问麦克风', 'bad');
      return;
    }

    S.recording = true;
    S.frames = [];
    S.userVals = null; S.userTimes = null; S.score = null;
    S.takeUrl = null;
    el.btnPlay.disabled = true;
    el.btnRec.disabled = true;
    el.btnTake.hidden = true;
    el.take.hidden = true;

    // ---- 倒计时：SVG 环 + 数字 ----
    var lead = D.prefersReduced() ? 900 : 2600;
    veil('准备好，跟着原声叫', 'count');
    var ring = D.$('#ringProg', el.veil);
    var numNode = D.$('#ringNum', el.veil);
    var C = 2 * Math.PI * 48;
    var t0c = performance.now();
    await new Promise(function (resolve) {
      var tick = function (ts) {
        var k = Math.min(1, (ts - t0c) / lead);
        ring.style.strokeDashoffset = String(C * k);
        var left = Math.ceil((1 - k) * 3);
        numNode.textContent = left > 0 ? String(left) : '开始';
        if (k < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    veilOff();

    el.reclive.classList.add('on');
    el.hud.classList.add('on');

    var t0 = performance.now();
    var lastT = -1;
    var maxDur = Math.max(2.5, (S.clipDur || S.ref.dur) * 2.4);

    var loop = function () {
      if (!S.recording) return;
      var t = (performance.now() - t0) / 1000;
      if (t - lastT >= 0.018) {
        lastT = t;
        var s = A.sample();
        if (s) {
          var res = AVA.signal.detectPitch(s.buf, s.sampleRate, P.PF.MINF, P.PF.MAXF);
          S.frames.push({ t: t, f: res[0], cl: res[1], rms: s.rms });
          el.hudHz.textContent = D.fmt.hz(res[0]);
          // 电平条：把 RMS 映射到 4%~100%，开方让小音量也看得见
          el.meterFill.style.height = Math.min(100, 4 + Math.sqrt(Math.min(1, s.rms * 6)) * 96) + '%';
          el.recTime.textContent = D.fmt.sec(t);
          var vo = S.frames.filter(function (x) { return x.f > 0 && x.cl > P.PF.VOICED_CL; });
          if (vo.length > 2) {
            S.userVals = P.smoothFrames(vo).map(P.hz2semi);
            S.userTimes = vo.map(function (x) { return x.t; });
          }
          redraw();
        }
      }
      if (t >= maxDur) { stopRec(); return; }
      rafRec = requestAnimationFrame(loop);
    };
    rafRec = requestAnimationFrame(loop);
  }

  async function stopRec() {
    if (!S.recording) return;
    S.recording = false;
    cancelAnimationFrame(rafRec);
    el.reclive.classList.remove('on');
    el.hud.classList.remove('on');
    el.meterFill.style.height = '4%';

    var blob = await A.closeMic();
    if (blob) {
      try { S.takeUrl = URL.createObjectURL(blob); } catch (e) { S.takeUrl = null; }
    }

    var result = SC.analyze(S.frames, S.ref);
    el.btnRec.disabled = false;
    el.btnPlay.disabled = false;
    el.btnRec.innerHTML = IC('i-mic') + '开始模仿';

    if (result.error) {
      S.userVals = null; S.userTimes = null;
      el.score.innerHTML = '<div class="state"><span class="state-ico">' + IC('i-mic-off') + '</span>' +
        '<h3>没听清</h3><p>' + D.escapeHtml(result.error) + '</p>' +
        '<div class="state-actions"><button class="btn btn-primary" id="again2">' + IC('i-mic') +
        '再录一次</button></div></div>';
      D.$('#again2', el.score).onclick = startRec;
      redraw();
      D.toast('没听到足够清楚的声音，再试一次', 'warn');
      return;
    }

    S.score = result;
    S.userVals = result.userVals;
    S.userTimes = result.userTimes;
    redraw();
    animateScore(result);

    var rec = ST.record(S.animal.slug, result.total);
    if (rec.isBest) {
      D.toast(rec.prev === undefined
        ? '首个成绩 ' + result.total + ' 分，已记录'
        : '刷新纪录！' + rec.prev + ' → ' + result.total, 'ok');
    }
    // API 模式下把成绩也报给服务端（全站榜单用）。失败不影响本地体验。
    AVA.source.submitScore(S.animal.slug, result);
    if (S.takeUrl) {
      el.btnTake.hidden = false;
      el.btnTake.innerHTML = IC('i-headphones') + '回听我的';
    }
    AVA.app.refreshChrome();
    refreshPicker();
    refreshRival();
  }

  function playTake() {
    if (!S.takeUrl) return;
    if (takePlayer) {
      takePlayer.pause(); takePlayer = null;
      el.btnTake.innerHTML = IC('i-headphones') + '回听我的';
      return;
    }
    takePlayer = new root.Audio(S.takeUrl);
    el.btnTake.innerHTML = IC('i-stop') + '停止回听';
    takePlayer.onended = function () {
      takePlayer = null;
      el.btnTake.innerHTML = IC('i-headphones') + '回听我的';
    };
    var pr = takePlayer.play();
    if (pr && pr.catch) pr.catch(function () { D.toast('回放失败，浏览器可能不支持该录音格式', 'warn'); });
  }

  /* ============================ 分享图 ============================ */
  function saveShareImage(r) {
    if (!AVA.share) { D.toast('当前环境不支持生成图片', 'warn'); return; }
    try {
      var cv = AVA.share.render(S.animal, r, ST.stats());
      AVA.share.download(cv, '动物模仿大赛-' + S.animal.cn + '-' + r.total + '.png');
      D.toast('成绩图已保存', 'ok');
    } catch (e) {
      D.toast('生成图片失败：' + e.message, 'bad');
    }
  }

  /* ============================ 提示条 ============================ */
  /* 环境类问题的横幅统一由 app 层负责，这里只做转发，保证只出现一条。 */
  function banner(msg) {
    if (AVA.app && AVA.app.banner) AVA.app.banner(msg);
  }

  /* ============================ 挂载 ============================ */

  function mount(host) {
    if (mounted) return;
    mounted = true;

    host.innerHTML =
      '<div class="arena">' +
        '<div class="panel panel-pad picker" id="picker"></div>' +
        '<div class="panel rival" id="rival"></div>' +
        '<div class="stage">' +
          '<div style="min-width:0">' +
            '<div class="hint" id="arenaHint" style="display:none"></div>' +
            // 操作按钮放在画布之前：主操作（开始模仿）不该被挤到首屏之外，
            // 用户要先看到「怎么叫」再决定「现在叫」。
            '<div class="acts">' +
              '<button class="btn" id="btnPlay" disabled>' + IC('i-play') + '听原声</button>' +
              '<button class="btn btn-primary btn-rec" id="btnRec" disabled>' + IC('i-mic') + '开始模仿</button>' +
              '<button class="btn" id="btnTake" hidden>' + IC('i-headphones') + '回听我的</button>' +
            '</div>' +
            '<div class="screen" id="screen" style="margin-top:12px">' +
              '<canvas id="cv"></canvas>' +
              '<div class="reclive" id="reclive"><span class="dot"></span><span>录音中</span>' +
                '<span class="t" id="recTime">0.0s</span></div>' +
              '<div class="hud" id="hud">' +
                '<span class="meter"><i id="meterFill"></i></span>' +
                '<span class="cell"><span class="k">基频</span>' +
                '<span class="v" id="hudHz">-- Hz</span></span>' +
              '</div>' +
              '<div class="veil" id="veil"></div>' +
            '</div>' +
            '<div class="legend">' +
              '<span class="key"><i class="swatch ref"></i>原声曲线</span>' +
              '<span class="key"><i class="swatch mic"></i>你的曲线</span>' +
              '<span class="axis">横轴＝时间，纵轴＝相对音高。两边各自抵消音域差异，唱不上去也不吃亏。</span>' +
            '</div>' +
            '<div class="credit" id="credit"></div>' +
          '</div>' +
          '<div class="panel panel-pad score" id="score"></div>' +
        '</div>' +
      '</div>';

    el.picker = D.$('#picker', host);
    el.rival = D.$('#rival', host);
    el.hint = D.$('#arenaHint', host);
    el.cv = D.$('#cv', host);
    el.veil = D.$('#veil', host);
    el.reclive = D.$('#reclive', host);
    el.recTime = D.$('#recTime', host);
    el.hud = D.$('#hud', host);
    el.hudHz = D.$('#hudHz', host);
    el.meterFill = D.$('#meterFill', host);
    el.credit = D.$('#credit', host);
    el.btnPlay = D.$('#btnPlay', host);
    el.btnRec = D.$('#btnRec', host);
    el.btnTake = D.$('#btnTake', host);
    el.score = D.$('#score', host);
    el.take = el.btnTake;

    el.btnPlay.onclick = playRef;
    el.btnRec.onclick = function () { S.recording ? stopRec() : startRec(); };
    el.btnTake.onclick = playTake;
    el.score.innerHTML = scoreEmptyHtml();

    D.on(root, 'resize', function () { if (AVA.app.current() === 'arena') redraw(); });
  }

  /** 音库加载完成后调用：把第一批内容铺进去。 */
  function feed() {
    if (!mounted) return;
    refreshPicker();
    refreshRival();
    redraw();
    if (!S.animal && ST.data.lastSlug && S.byslug[ST.data.lastSlug]) {
      select(ST.data.lastSlug);        // 自动回到上次玩的那只
    }
  }

  function error(message) {
    if (!mounted) return;
    banner(message);
    el.picker.innerHTML = '';
    el.rival.innerHTML = '';
    redraw();
  }

  function leave() { closeAllPlayback(); }

  AVA.views.arena = {
    id: 'arena', label: '竞技场', icon: 'i-target',
    mount: mount, feed: feed, error: error, leave: leave,
    select: select, redraw: redraw, startRec: startRec, stopRec: stopRec,
    playRef: playRef,
    isRecording: function () { return S.recording; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
