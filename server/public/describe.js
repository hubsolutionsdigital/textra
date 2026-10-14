/*
 * Describes where on a page an element is, in words a developer can follow:
 * { section: 3, sections: 9, sectionName: 'Our games', element: 'the “Play now” button' }.
 * Sections are the page's content blocks, counted inside <main> when there is one; the header,
 * footer, navigation and overlays get a name (sectionName) but no number (section: 0).
 * Plain ES5 with no globals: it is inlined into frame.js (in the browser, with a visibility check
 * and the elements under the click point) and evaluated on the server against the stored HTML for
 * comments left before this existed.
 */
function describeTarget(el, isVisible, underPoint) {
  var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|LINK|META|TEMPLATE|BASE|TITLE)$/;
  var BLOCK = /^(DIV|P|LI|UL|OL|SECTION|ARTICLE|HEADER|FOOTER|NAV|MAIN|H[1-6]|TABLE|TR|TD|TH|FIGURE|FIGCAPTION|BLOCKQUOTE|DD|DT|FORM)$/;
  var MEDIA = 'img, picture, svg, video, canvas, iframe';

  function tag(e) {
    return String((e && e.tagName) || '').toUpperCase();
  }
  function attr(e, name) {
    return (e && e.getAttribute && e.getAttribute(name)) || '';
  }
  function shown(e) {
    if (SKIP.test(tag(e)) || (e.hasAttribute && e.hasAttribute('data-review-portal'))) return false;
    return !isVisible || isVisible(e);
  }
  function kids(e) {
    return Array.prototype.filter.call(e.children || [], shown);
  }
  // Readable text: <br> and block boundaries become spaces ("One proven core.<br>Endless" keeps its gap).
  function rawText(n) {
    if (n.nodeType === 3) return n.nodeValue || '';
    if (n.nodeType !== 1 || SKIP.test(tag(n))) return '';
    if (tag(n) === 'BR') return ' ';
    var out = '';
    for (var c = n.firstChild; c; c = c.nextSibling) out += rawText(c);
    return BLOCK.test(tag(n)) ? ' ' + out + ' ' : out;
  }
  function text(e, max) {
    var t = rawText(e).replace(/\s+/g, ' ').trim();
    max = max || 60;
    return t.length > max ? t.slice(0, max - 1).trim() + '…' : t;
  }
  function quote(t) {
    return '“' + t + '”';
  }
  function humanize(s) {
    s = String(s || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length < 3 || /^\d+$/.test(s) || s.length > 40) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function hasContent(e) {
    return (
      text(e, 5) !== '' ||
      !!(e.querySelector && e.querySelector(MEDIA)) ||
      /^(IMG|SVG|VIDEO|CANVAS|PICTURE)$/.test(tag(e))
    );
  }
  function contains(a, b) {
    return a === b || (a.contains && a.contains(b));
  }
  // Skip single wrappers (div#app, .page-wrapper) to reach the real list of blocks.
  function unwrap(container) {
    var list = kids(container);
    while (list.length === 1 && kids(list[0]).length) {
      container = list[0];
      list = kids(container);
    }
    return list;
  }
  function blocksOf(container) {
    var out = [];
    var list = unwrap(container);
    for (var i = 0; i < list.length; i++) if (hasContent(list[i])) out.push(list[i]);
    // A lone wrapper inside main (e.g. <main><div class="page">…</div></main>) holds the real sections.
    return out.length === 1 && kids(out[0]).length > 1 ? blocksOf(out[0]) : out;
  }

  var doc = el.ownerDocument;
  var body = doc && doc.body;
  var result = { section: 0, sections: 0, sectionName: '', element: '' };
  if (!body) return result;

  // Content sections: inside <main> when the page has one, else the top-level blocks of the page.
  var main = body.querySelector('main, [role="main"]');
  if (main && !shown(main)) main = null;
  var numbered = blocksOf(main || body).filter(function (b) {
    return main || !/^(HEADER|FOOTER|NAV)$/.test(tag(b));
  });
  result.sections = numbered.length;

  var section = null;
  for (var i = 0; i < numbered.length; i++) {
    if (contains(numbered[i], el)) {
      section = numbered[i];
      result.section = i + 1;
      break;
    }
  }
  var outside = null; // header, footer, menu overlay, chat widget: the top-level block holding el
  if (!section) {
    var top = el;
    while (top && top.parentElement && top.parentElement !== body) top = top.parentElement;
    if (top && top !== body && top !== doc.documentElement) outside = top;
  }

  var block = section || outside;
  if (block) {
    var bt = tag(block);
    var role = attr(block, 'role');
    var heading = block.querySelector && block.querySelector('h1, h2, h3');
    if (bt === 'HEADER' || role === 'banner') result.sectionName = 'Header';
    else if (bt === 'FOOTER' || role === 'contentinfo') result.sectionName = 'Footer';
    else if (bt === 'NAV' || role === 'navigation') result.sectionName = 'Navigation';
    else {
      result.sectionName =
        attr(block, 'aria-label') ||
        (heading && text(heading, 50)) ||
        humanize(block.id) ||
        (outside ? humanize(String(block.className || '').split(' ')[0]) : '');
    }
  }

  // The thing that was clicked: a button or link it sits in wins (clicks often land on an inner
  // span or icon), otherwise the nearest meaningful element within a few levels.
  function interactive(n) {
    for (var up = 0; n && up < 6 && n !== block && n !== body; up++, n = n.parentElement) {
      var nt = tag(n);
      if (nt === 'BUTTON' || nt === 'A' || attr(n, 'role') === 'button') return n;
    }
    return null;
  }
  function describe(start) {
    var node = interactive(start) || start;
    for (var depth = 0; node && depth < 5 && node !== block && node !== body; depth++, node = node.parentElement) {
      var t = tag(node);
      var label = attr(node, 'aria-label') || attr(node, 'title');
      if (t === 'BUTTON' || attr(node, 'role') === 'button' || (t === 'INPUT' && /^(submit|button)$/i.test(node.type || ''))) {
        return 'the ' + quote(label || text(node, 40) || node.value || 'button') + ' button';
      }
      if (t === 'A') return 'the ' + quote(label || text(node, 40) || 'link') + ' link';
      if (t === 'IMG' || t === 'PICTURE' || t === 'SVG' || t === 'CANVAS' || t === 'VIDEO') {
        var alt = t === 'IMG' ? attr(node, 'alt') : label;
        var kind = t === 'VIDEO' ? 'video' : t === 'SVG' ? 'icon / graphic' : 'image';
        return alt ? 'the ' + kind + ' ' + quote(alt.length > 50 ? alt.slice(0, 49) + '…' : alt) : 'the ' + kind;
      }
      if (/^H[1-6]$/.test(t)) return 'the heading ' + quote(text(node, 60));
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') {
        var fieldName = label || attr(node, 'placeholder') || attr(node, 'name');
        return fieldName ? 'the ' + quote(fieldName) + ' field' : 'a form field';
      }
      if (t === 'LI') return 'the list item ' + quote(text(node, 50));
      if (/^(P|BLOCKQUOTE|LABEL|FIGCAPTION|DT|DD|TD|TH)$/.test(t) && text(node, 60)) return 'the text ' + quote(text(node, 60));
    }
    return '';
  }

  result.element = describe(el);
  // Clicks often land on a decorative layer; try what else is under the pointer in the same block.
  for (var k = 0; !result.element && underPoint && k < underPoint.length && k < 12; k++) {
    if (underPoint[k] !== el && (!block || contains(block, underPoint[k]))) result.element = describe(underPoint[k]);
  }
  if (!result.element) {
    var h = el.querySelector && el.querySelector('h1, h2, h3, h4');
    var near = text(el, 60);
    if (el === block) result.element = 'the background of this section';
    else if (h && text(h, 60)) result.element = 'the area around the heading ' + quote(text(h, 60));
    else if (near) result.element = 'the area around ' + quote(near);
  }
  return result;
}
