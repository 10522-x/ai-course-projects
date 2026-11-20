/* =========================================================================
   ui/chart.js · 主画布绘制：背景波形 + 两条音高曲线 + 播放头
   -------------------------------------------------------------------------
   横轴＝时间，纵轴＝相对音高（两侧各自减去中位数，所以音域不同也能对齐比较）。
   颜色全部从 CSS 变量里读，主题切换时调 invalidate() 让其重新取值。
   挂载：AVA.chart = { draw, invalidate }
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  var D = AVA.dom;
  var P = AVA.pitch;

  var pal = null;

  function invalidate() { pal = null; }

  function palette() {
    if (pal) return pal;
    var cs = root.getComputedStyle ? root.getComputedStyle(root.document.documentElement) : null;
    var get = function (name, fb) {
      if (!cs) return fb;
      var v = cs.getPropertyValue(name);
      return (v && v.trim()) || fb;
    };
    pal = {
      ref: get('--ref', '#BC5717'),
      mic: get('--mic', '#0E7A58'),
      grid: get('--line', '#DDE6D9'),
      wave: get('--paper-4', '#DCE6D8'),
      axis: get('--muted-2', '#8B9C93'),
      ink: get('--ink', '#0C1F17'),
      paper: get('--paper-2', '#FFFFFF'),
      refFill: get('--ref-soft', '#F8ECE1'),
    };
    return pal;
  }

  function fit(cv) {
    var dpr = root.devicePixelRatio || 1;
    var r = cv.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width || 600));
    var h = Math.max(1, Math.round(r.height || 300));
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  /**
   * model = {
   *   ref:       { vals, times } | null
   *   refPeaks:  number[] | null
   *   userVals:  number[] | null
   *   userTimes: number[] | null
   *   progress:  number 0~1 | null   播放头
   *   empty:     string | null       没有曲线时画在中间的提示文字
   * }
   */
  function draw(cv, model) {
    var f = fit(cv);
    var ctx = f.ctx, w = f.w, h = f.h;
    ctx.clearRect(0, 0, w, h);
    var c = palette();

    if (!model.ref) {
      ctx.fillStyle = c.axis;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(model.empty || '选一只动物开始', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }

    var pad = { l: 38, r: 16, t: 18, b: 26 };
    var iw = w - pad.l - pad.r;
    var ih = h - pad.t - pad.b;
    var X = function (u) { return pad.l + u * iw; };

    // ---- 纵向区间：以中位数为 0，两侧都裁到 ±15 半音，避免离群点压扁整条曲线 ----
    var refN = model.ref.vals.map(function (v) { return v - P.median(model.ref.vals); });
    var usrN = null;
    if (model.userVals && model.userVals.length) {
      var um = P.median(model.userVals);
      usrN = model.userVals.map(function (v) { return v - um; });
    }
    var lo = Math.min.apply(null, refN), hi = Math.max.apply(null, refN);
    if (usrN) { lo = Math.min(lo, Math.min.apply(null, usrN)); hi = Math.max(hi, Math.max.apply(null, usrN)); }
    var y0 = Math.max(lo, -15) - 2, y1 = Math.min(hi, 15) + 2;
    if (y1 - y0 < 7) { var mid = (y0 + y1) / 2; y0 = mid - 3.5; y1 = mid + 3.5; }
    var Y = function (s) { return pad.t + ih - ((s - y0) / (y1 - y0)) * ih; };

    // ---- 背景波形 ----
    if (model.refPeaks) {
      var n = model.refPeaks.length, mid = pad.t + ih / 2, amp = ih * 0.46;
      ctx.fillStyle = c.wave;
      for (var i = 0; i < n; i++) {
        var x = pad.l + (i + 0.5) * (iw / n);
        var hh = Math.max(0.6, model.refPeaks[i] * amp);
        ctx.fillRect(x - 0.6, mid - hh, 1.2, hh * 2);
      }
    }

    // ---- 网格 ----
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    var g, yy, xx;
    for (g = 0; g <= 4; g++) {
      yy = pad.t + ih * g / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(pad.l + iw, yy); ctx.stroke();
    }
    for (g = 0; g <= 4; g++) {
      xx = pad.l + iw * g / 4;
      ctx.beginPath(); ctx.moveTo(xx, pad.t); ctx.lineTo(xx, pad.t + ih); ctx.stroke();
    }

    // ---- 轴标注 ----
    ctx.fillStyle = c.axis;
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('高', 10, pad.t + 10);
    ctx.fillText('低', 10, pad.t + ih - 2);
    ctx.save();
    ctx.translate(13, pad.t + ih / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('相对音高', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillText('时间', pad.l, h - 8);

    // ---- 曲线路径工具 ----
    var path = function (vals, times) {
      ctx.beginPath();
      var t0 = times[0], sp = Math.max(1e-6, times[times.length - 1] - t0);
      for (var k = 0; k < vals.length; k++) {
        var px = X((times[k] - t0) / sp), py = Y(vals[k]);
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
    };

    // ---- 原声曲线（带面积填充，视觉上作为"靶子"） ----
    path(refN, model.ref.times);
    ctx.lineTo(X(1), pad.t + ih);
    ctx.lineTo(X(0), pad.t + ih);
    ctx.closePath();
    ctx.fillStyle = c.refFill;
    ctx.globalAlpha = .55;
    ctx.fill();
    ctx.globalAlpha = 1;

    path(refN, model.ref.times);
    ctx.strokeStyle = c.ref;
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // ---- 你的曲线 ----
    if (usrN && usrN.length > 1) {
      path(usrN, model.userTimes);
      ctx.strokeStyle = c.mic;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.shadowColor = c.mic;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = .9;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }

    // ---- 播放头 ----
    if (typeof model.progress === 'number') {
      var px2 = X(model.progress);
      ctx.beginPath(); ctx.moveTo(px2, pad.t - 5); ctx.lineTo(px2, pad.t + ih + 5);
      ctx.strokeStyle = c.ink;
      ctx.globalAlpha = .32;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(px2, pad.t - 5, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = c.ink;
      ctx.fill();
    }
    ctx.textAlign = 'left';
  }

  AVA.chart = { draw: draw, invalidate: invalidate, palette: palette };
})(typeof window !== 'undefined' ? window : globalThis);
