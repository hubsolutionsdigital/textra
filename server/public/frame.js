/*
 * Review portal helper, injected into uploaded HTML prototypes.
 * The page runs in a sandboxed iframe; this script talks to the portal with postMessage only.
 *  - draws comment pins on top of the page, anchored to the element they were left on,
 *    so they follow scrolling, animations and different screen sizes
 *  - in "comment" mode, turns clicks into comment positions instead of page interactions
 */
(function () {
  if (window.parent === window || window.__reviewPortal) return;
  window.__reviewPortal = true;

  var mode = 'browse';
  var pins = [];
  var draft = null;
  var hidden = '';
  var host, root, style;

  function send(msg) {
    window.parent.postMessage(Object.assign({ __portal: true }, msg), '*');
  }

  function pagePath() {
    // /sites/<token>/sub/page.html -> sub/page.html
    return location.pathname.split('/').slice(3).join('/');
  }

  // ---------- element anchors ----------

  function esc(id) {
    return window.CSS && CSS.escape ? CSS.escape(id) : id.replace(/[^\w-]/g, '\\$&');
  }

  function uniqueId(el) {
    if (!el.id) return null;
    try {
      return document.querySelectorAll('#' + esc(el.id)).length === 1 ? '#' + esc(el.id) : null;
    } catch (e) {
      return null;
    }
  }

  function selectorFor(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      var id = uniqueId(el);
      if (id) {
        parts.unshift(id);
        return parts.join(' > ');
      }
      var tag = el.tagName.toLowerCase();
      var i = 1;
      var sib = el;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === el.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return parts.length ? 'body > ' + parts.join(' > ') : 'body';
  }

  /** Viewport position for a saved anchor, or null if it isn't visible at this size. */
  function locate(a) {
    var el = null;
    try {
      el = a.selector ? document.querySelector(a.selector) : null;
    } catch (e) {}
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return null;
      return { x: r.left + a.fx * r.width, y: r.top + a.fy * r.height };
    }
    // Fallback: page coordinates, scaled horizontally to the current width.
    var scale = window.innerWidth / (a.vw || window.innerWidth);
    return { x: a.px * scale - window.scrollX, y: a.py - window.scrollY };
  }

  // ---------- pin layer (shadow DOM so the page's CSS can't touch it) ----------

  var TONES = { positive: '#0f766e', change: '#b45309', question: '#2f6fd6', draft: '#1b3a6b' };

  function ensureLayer() {
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-review-portal', '');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      '.pin{position:absolute;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:50% 50% 50% 4px;' +
      'display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui,sans-serif;color:#fff;' +
      'border:2px solid #fff;box-shadow:0 2px 6px rgba(15,27,45,.3);cursor:pointer;pointer-events:auto;transition:transform .12s}' +
      '.pin:hover,.pin.active{transform:translate(-50%,-50%) scale(1.15)}' +
      '.ghost{width:20px;height:20px;font-size:11px;background:rgba(255,255,255,.9)!important;border:1.5px dashed #5b6b80;' +
      'opacity:.5;box-shadow:none}.ghost:hover,.ghost.active{opacity:1}' +
      '.draft{animation:pulse 1.2s infinite}' +
      '@keyframes pulse{50%{box-shadow:0 0 0 10px rgba(27,58,107,0)}0%,100%{box-shadow:0 0 0 0 rgba(27,58,107,.45)}}' +
      '.flash{animation:flash .9s 2}@keyframes flash{50%{transform:translate(-50%,-50%) scale(1.5)}}' +
      '</style><div id="pins"></div>';
    document.documentElement.appendChild(host);
    style = document.createElement('style');
    style.textContent = 'html.__rp-comment, html.__rp-comment * { cursor: crosshair !important; }';
    document.documentElement.appendChild(style);
  }

  function render() {
    ensureLayer();
    var box = root.getElementById('pins');
    var all = draft ? pins.concat([Object.assign({ id: '__draft', tone: 'draft', label: '+', draft: true }, draft)]) : pins;
    var nowHidden = [];
    var seen = {};
    all.forEach(function (p) {
      var key = String(p.id);
      seen[key] = true;
      var el = box.querySelector('[data-id="' + key + '"]');
      if (!el) {
        el = document.createElement('div');
        el.setAttribute('data-id', key);
        el.addEventListener('mouseenter', function () {
          var r = el.getBoundingClientRect();
          send({ type: 'pin-hover', id: p.id, x: r.right, y: r.top });
        });
        el.addEventListener('mouseleave', function () {
          send({ type: 'pin-leave', id: p.id });
        });
        el.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var r = el.getBoundingClientRect();
          send({ type: 'pin-click', id: p.id, x: r.right, y: r.top });
        });
        box.appendChild(el);
      }
      el.className = 'pin' + (p.ghost ? ' ghost' : '') + (p.draft ? ' draft' : '') + (p.active ? ' active' : '');
      el.style.background = TONES[p.tone] || TONES.change;
      el.textContent = p.label;
      var pos = locate(p);
      if (!pos) {
        el.style.display = 'none';
        if (!p.draft) nowHidden.push(p.id);
      } else {
        el.style.display = '';
        el.style.left = pos.x + 'px';
        el.style.top = pos.y + 'px';
      }
    });
    Array.prototype.slice.call(box.children).forEach(function (el) {
      if (!seen[el.getAttribute('data-id')]) el.remove();
    });
    var key = nowHidden.join(',');
    if (key !== hidden) {
      hidden = key;
      send({ type: 'hidden', ids: nowHidden });
    }
  }

  // Re-place pins every frame: cheap, and it keeps them glued to animated and sticky content.
  function loop() {
    if (pins.length || draft) render();
    requestAnimationFrame(loop);
  }

  // ---------- comment mode ----------

  function isOurs(e) {
    return host && e.composedPath && e.composedPath().indexOf(host) !== -1;
  }

  function onClick(e) {
    if (mode !== 'comment' || isOurs(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    var target = e.target && e.target.nodeType === 1 ? e.target : document.body;
    var r = target.getBoundingClientRect();
    send({
      type: 'click',
      x: e.clientX,
      y: e.clientY,
      anchor: {
        page: pagePath(),
        selector: selectorFor(target),
        fx: r.width ? (e.clientX - r.left) / r.width : 0,
        fy: r.height ? (e.clientY - r.top) / r.height : 0,
        px: e.clientX + window.scrollX,
        py: e.clientY + window.scrollY,
        vw: window.innerWidth,
      },
    });
  }

  // Block the rest of the click sequence too, so menus and links don't react in comment mode.
  function swallow(e) {
    if (mode === 'comment' && !isOurs(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  window.addEventListener('click', onClick, true);
  // Touch events are left alone so the page can still be scrolled on phones in comment mode.
  ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit'].forEach(function (t) {
    window.addEventListener(t, swallow, { capture: true, passive: false });
  });

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || !e.data.__portal) return;
    var m = e.data;
    if (m.type === 'mode') {
      mode = m.mode;
      document.documentElement.classList.toggle('__rp-comment', mode === 'comment');
    } else if (m.type === 'pins') {
      pins = m.pins || [];
      render();
    } else if (m.type === 'draft') {
      draft = m.anchor || null;
      render();
    } else if (m.type === 'focus') {
      var p = pins.filter(function (x) {
        return x.id === m.id;
      })[0];
      if (!p) return;
      var el = null;
      try {
        el = document.querySelector(p.selector);
      } catch (err) {}
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else window.scrollTo({ top: p.py - window.innerHeight / 2, behavior: 'smooth' });
      setTimeout(function () {
        var pinEl = root && root.querySelector('[data-id="' + m.id + '"]');
        if (pinEl) {
          pinEl.classList.remove('flash');
          void pinEl.offsetWidth;
          pinEl.classList.add('flash');
        }
      }, 450);
    }
  });

  function ready() {
    ensureLayer();
    send({ type: 'ready', page: pagePath() });
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
  window.addEventListener('scroll', function () {
    send({ type: 'scroll' });
  }, { passive: true, capture: true });
})();
