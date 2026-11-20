/* =========================================================================
   ui/share.js · 把成绩渲染成一张可保存的卡片
   纯 Canvas 2D 绘制，不依赖任何外部库；中文字体走系统字体。
   挂载：AVA.share = { render, download }
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  var SC = AVA.score;

  var W = 1080, H = 1350;

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function font(size, weight) {
    return (weight || 400) + ' ' + size + 'px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  }
  function mono(size, weight) {
    return (weight || 700) + ' ' + size + 'px ui-monospace,"SF Mono",Consolas,monospace';
  }

  /**
   * animal: credits.json 里的一条
   * r:      analyze() 的结果
   * st:     store.stats() 的汇总
   */
  function render(animal, r, st) {
    var cv = root.document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    // ---- 底色 ----
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#F1F5EF');
    bg.addColorStop(1, '#E4EEE4');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 右上角的色雾
    var glow = ctx.createRadialGradient(W, 0, 0, W, 0, 720);
    glow.addColorStop(0, 'rgba(14,122,88,.16)');
    glow.addColorStop(1, 'rgba(14,122,88,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 720);

    // ---- 主卡片 ----
    ctx.save();
    ctx.shadowColor = 'rgba(12,31,23,.14)';
    ctx.shadowBlur = 46;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, 56, 56, W - 112, H - 112, 34);
    ctx.fill();
    ctx.restore();

    var L = 116, R = W - 116;

    // ---- 页眉 ----
    ctx.fillStyle = '#0E7A58';
    roundRect(ctx, L, 116, 44, 44, 13);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(26, 700);
    ctx.textAlign = 'center';
    ctx.fillText('♪', L + 22, 148);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#0C1F17';
    ctx.font = font(30, 800);
    ctx.fillText('动物模仿大赛', L + 60, 148);

    ctx.fillStyle = '#8B9C93';
    ctx.font = mono(20, 600);
    ctx.textAlign = 'right';
    ctx.fillText('ANIMAL VOICE ARENA', R, 145);
    ctx.textAlign = 'left';

    // ---- 物种 ----
    ctx.fillStyle = '#0C1F17';
    ctx.font = font(96, 400);
    ctx.fillText(animal.emoji, L, 316);

    ctx.font = font(56, 800);
    ctx.fillText(animal.cn, L + 140, 292);
    ctx.fillStyle = '#667C72';
    ctx.font = 'italic ' + font(26, 500);
    ctx.fillText(animal.sci, L + 142, 330);

    // ---- 大分数 ----
    var g = SC.gradeOf(r.total);
    var gcolor = { S: '#9A6B10', A: '#0E7A58', B: '#2C6E7F', C: '#5C6B63', D: '#A93B2A' }[g];
    var gbg = { S: '#F7EDD6', A: '#DCEFE6', B: '#DFEEF2', C: '#E6ECE7', D: '#F8E5E1' }[g];

    ctx.fillStyle = '#667C72';
    ctx.font = font(22, 600);
    ctx.fillText('总分', L, 452);

    ctx.fillStyle = gcolor;
    ctx.font = mono(172, 800);
    ctx.fillText(String(r.total), L, 596);

    var numW = ctx.measureText(String(r.total)).width;
    ctx.font = font(28, 700);
    ctx.fillStyle = '#8B9C93';
    ctx.fillText('/ 100', L + numW + 16, 592);

    // 等级徽章
    ctx.fillStyle = gbg;
    var bx = R - 132;
    roundRect(ctx, bx, 452, 132, 132, 26);
    ctx.fill();
    ctx.fillStyle = gcolor;
    ctx.font = mono(78, 800);
    ctx.textAlign = 'center';
    ctx.fillText(g, bx + 66, 452 + 92);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#2F453B';
    ctx.font = font(28, 600);
    ctx.fillText(SC.VERDICT[g], L, 662);

    // ---- 分隔线 ----
    ctx.strokeStyle = '#DDE6D9';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L, 712); ctx.lineTo(R, 712); ctx.stroke();

    // ---- 四维条形 ----
    var rows = [
      ['音准准确度', r.pitchScore, '#0E7A58', SC.WEIGHTS.pitch],
      ['节奏时长', r.rhythmScore, '#BC5717', SC.WEIGHTS.rhythm],
      ['音高走向', r.shapeScore, '#9A6B10', SC.WEIGHTS.shape],
      ['稳定完成度', r.stabilityScore, '#2C6E7F', SC.WEIGHTS.stability],
    ];
    var y = 760;
    rows.forEach(function (row) {
      ctx.fillStyle = '#2F453B';
      ctx.font = font(26, 600);
      ctx.fillText(row[0], L, y);
      ctx.fillStyle = '#8B9C93';
      ctx.font = mono(21, 600);
      ctx.fillText(Math.round(row[3] * 100) + '%', L + 176, y);

      ctx.fillStyle = row[2];
      ctx.font = mono(30, 700);
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(row[1])), R, y + 4);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#E7EEE4';
      roundRect(ctx, L, y + 20, R - L, 12, 6);
      ctx.fill();
      ctx.fillStyle = row[2];
      roundRect(ctx, L, y + 20, Math.max(12, (R - L) * Math.min(1, row[1] / 100)), 12, 6);
      ctx.fill();

      y += 86;
    });

    // ---- 底部战报条 ----
    ctx.fillStyle = '#F1F5EF';
    roundRect(ctx, L, y + 10, R - L, 116, 20);
    ctx.fill();

    var cells = [
      ['已挑战物种', st.played + ' / ' + st.species],
      ['累计模仿', st.attempts + ' 次'],
      ['物种最高分', String(st.bestTotal || r.total)],
    ];
    var cw = (R - L) / 3;
    cells.forEach(function (c, i) {
      var cx = L + cw * i + 28;
      ctx.fillStyle = '#667C72';
      ctx.font = font(21, 600);
      ctx.fillText(c[0], cx, y + 52);
      ctx.fillStyle = '#0C1F17';
      ctx.font = mono(32, 800);
      ctx.fillText(c[1], cx, y + 96);
      if (i) {
        ctx.strokeStyle = '#DDE6D9';
        ctx.beginPath();
        ctx.moveTo(L + cw * i, y + 28); ctx.lineTo(L + cw * i, y + 108); ctx.stroke();
      }
    });

    // ---- 页脚 ----
    ctx.fillStyle = '#8B9C93';
    ctx.font = font(21, 500);
    ctx.fillText('原声 XC' + animal.xcid + ' · ' + (animal.recordist || '佚名'), L, H - 132);
    ctx.fillText('xeno-canto.org · ' + (AVA.dom ? AVA.dom.fmt.lic(animal.license) : ''), L, H - 100);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0E7A58';
    ctx.font = mono(21, 700);
    ctx.fillText(new Date().toLocaleDateString('zh-CN'), R, H - 100);
    ctx.textAlign = 'left';

    return cv;
  }

  function download(cv, filename) {
    var url = cv.toDataURL('image/png');
    var a = root.document.createElement('a');
    a.href = url;
    a.download = filename;
    root.document.body.appendChild(a);
    a.click();
    root.document.body.removeChild(a);
  }

  AVA.share = { render: render, download: download };
})(typeof window !== 'undefined' ? window : globalThis);
