/* =========================================================================
   ui/dom.js · DOM 工具、图标、提示条、格式化
   -------------------------------------------------------------------------
   挂载：AVA.dom = { $, $$, el, html, icon, toast, fmt, on, prefersReduced }
   ========================================================================= */
(function (root) {
  'use strict';
  var AVA = root.AVA = root.AVA || {};
  var doc = root.document;

  function $(sel, scope) { return (scope || doc).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || doc).querySelectorAll(sel)); }

  /** el('div', {class:'x'}, ['文字', nodeEl]) */
  function el(tag, attrs, kids) {
    var n = doc.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'style') n.setAttribute('style', attrs[k]);
      else if (k.slice(0, 2) === 'on') n[k] = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) {
        n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
      }
    }
    if (kids) [].concat(kids).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return n;
  }

  /** 把 HTML 字符串变成节点。 */
  function html(str) {
    var t = doc.createElement('template');
    t.innerHTML = String(str).trim();
    return t.content.firstElementChild;
  }

  /** 内联 SVG 图标（图标定义在 index.html 的 sprite 里）。 */
  function icon(id, cls) {
    return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- Toast ---------------- */
  var host = null;
  var TOAST_ICON = { ok: 'i-check', warn: 'i-alert', bad: 'i-alert', info: 'i-info' };

  function toast(msg, kind, ms) {
    kind = kind || 'info';
    if (!host) {
      host = el('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      doc.body.appendChild(host);
    }
    var t = el('div', { class: 'toast toast-' + kind });
    t.innerHTML = icon(TOAST_ICON[kind] || 'i-info') + '<span>' + escapeHtml(msg) + '</span>';
    host.appendChild(t);
    var life = ms || (kind === 'bad' ? 5200 : 3000);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }, life);
    return t;
  }

  /* ---------------- 格式化 ---------------- */
  var fmt = {
    /** 分数：整数，不带小数。 */
    score: function (v) { return String(Math.round(v)); },
    /** 频率：Hz 取整。 */
    hz: function (v) { return v > 0 ? Math.round(v) + ' Hz' : '-- Hz'; },
    /** 秒：一位小数 + s。 */
    sec: function (v, digits) { return Number(v).toFixed(digits == null ? 1 : digits) + 's'; },
    /** 百分数。 */
    pct: function (v) { return Math.round(v * 100) + '%'; },
    /** 相对时间：「刚刚 / 3 分钟前 / 昨天 / 9月12日」 */
    when: function (ts) {
      var d = new Date(ts);
      var diff = Date.now() - ts;
      if (diff < 60e3) return '刚刚';
      if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
      if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
      if (diff < 172800e3) return '昨天';
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    },
    /** 许可证 URL → 简称 */
    lic: function (url) {
      var m = (url || '').match(/licenses\/([a-z-]+)\//);
      if (!m) return '许可未知';
      var map = {
        cc0: 'CC0 公共领域', by: 'CC BY 署名',
        'by-sa': 'CC BY-SA 署名-相同方式共享', 'by-nc': 'CC BY-NC 署名-非商业',
        'by-nc-sa': 'CC BY-NC-SA 署名-非商业-相同方式共享',
        'by-nd': 'CC BY-ND 署名-禁演绎', 'by-nc-nd': 'CC BY-NC-ND 署名-非商业-禁演绎',
      };
      return map[m[1]] || m[1].toUpperCase();
    },
  };

  function on(target, ev, fn, opts) {
    if (!target) return function () {};
    target.addEventListener(ev, fn, opts);
    return function () { target.removeEventListener(ev, fn, opts); };
  }

  function prefersReduced() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  AVA.dom = {
    $: $, $$: $$, el: el, html: html, icon: icon, escapeHtml: escapeHtml,
    toast: toast, fmt: fmt, on: on, prefersReduced: prefersReduced,
  };
})(typeof window !== 'undefined' ? window : globalThis);
