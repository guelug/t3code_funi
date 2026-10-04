/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived in part from Open Design's clipper/capture.js (Apache-2.0); modified by FUNIBER.
 *
 * Capture runtime injected INTO the sandboxed preview iframe. It is kept as a plain
 * string (not Function#toString) so bundler transforms can never inject helpers into it.
 * It walks the live DOM and emits the FUNIBER Figma capture IR (see figma-plugin/IR.md).
 * Protocol: on load, and whenever its parent posts {type:"fidesign-capture-request"},
 * it posts {type:"fidesign-capture-result", ir} to the parent (opaque origin => "*";
 * the host validates event.source against the iframe's contentWindow).
 */
export const CAPTURE_MESSAGE_REQUEST = "fidesign-capture-request";
export const CAPTURE_MESSAGE_RESULT = "fidesign-capture-result";

export const CAPTURE_SCRIPT = String.raw`
(function () {
  if (window.__fidesignCapture) return;
  var MAX_NODES = 6000;
  function parseColor(str) {
    if (!str) return null;
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(str);
    if (!m) return null;
    var a = m[4] === undefined ? 1 : Number(m[4]);
    return { r: Math.min(1, Number(m[1]) / 255), g: Math.min(1, Number(m[2]) / 255),
      b: Math.min(1, Number(m[3]) / 255), a: isFinite(a) ? a : 1 };
  }
  function solidFill(c) {
    if (!c || c.a === 0) return null;
    return { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a };
  }
  function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
  function radii(s) {
    var tl = px(s.borderTopLeftRadius), tr = px(s.borderTopRightRadius),
      br = px(s.borderBottomRightRadius), bl = px(s.borderBottomLeftRadius);
    if (tl === tr && tr === br && br === bl) return tl;
    return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
  }
  function borderStroke(s) {
    var w = px(s.borderTopWidth);
    if (!w || s.borderTopStyle === 'none' || s.borderTopStyle === 'hidden') return null;
    var fill = solidFill(parseColor(s.borderTopColor));
    if (!fill) return null;
    var uniform = s.borderTopWidth === s.borderRightWidth && s.borderRightWidth === s.borderBottomWidth &&
      s.borderBottomWidth === s.borderLeftWidth;
    if (!uniform) return null;
    return { stroke: fill, weight: w };
  }
  function parseShadow(bs) {
    if (!bs || bs === 'none') return null;
    var first = bs.split(/,(?![^(]*\))/)[0].trim();
    if (/\binset\b/.test(first)) return null;
    var cm = /rgba?\([^)]+\)|#[0-9a-f]{3,8}/i.exec(first);
    var color = parseColor(cm ? cm[0] : '');
    var nums = (first.replace(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i, '').match(/-?[\d.]+px/g) || []).map(px);
    if (!color || nums.length < 2) return null;
    return { type: 'DROP_SHADOW', color: { r: color.r, g: color.g, b: color.b, a: color.a },
      offset: { x: nums[0] || 0, y: nums[1] || 0 }, radius: nums[2] || 0, spread: nums[3] || 0 };
  }
  function fontStyleName(weight, italic) {
    var w = Number(weight) || 400;
    var name = w <= 100 ? 'Thin' : w <= 200 ? 'ExtraLight' : w <= 300 ? 'Light' : w <= 400 ? 'Regular'
      : w <= 500 ? 'Medium' : w <= 600 ? 'SemiBold' : w <= 700 ? 'Bold' : w <= 800 ? 'ExtraBold' : 'Black';
    if (italic) return name === 'Regular' ? 'Italic' : name + ' Italic';
    return name;
  }
  function firstFamily(ff) { return (ff || 'Inter').split(',')[0].replace(/["']/g, '').trim() || 'Inter'; }
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, LINK: 1, META: 1, HEAD: 1, TITLE: 1, BR: 1, svg: 1, SVG: 1 };
  function visible(s) {
    return !(s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || Number(s.opacity) === 0);
  }
  function textRect(node) {
    try { var r = document.createRange(); r.selectNodeContents(node); return r.getBoundingClientRect(); }
    catch (e) { return null; }
  }

  function capture() {
    var sx = window.scrollX || 0, sy = window.scrollY || 0;
    var fonts = {}, count = 0;
    function elementNode(el) {
      if (count >= MAX_NODES) return null;
      var s = getComputedStyle(el);
      if (!visible(s)) return null;
      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      count++;
      var node = { type: 'FRAME', name: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
        x: rect.left + sx, y: rect.top + sy, width: rect.width, height: rect.height };
      var fills = [];
      var imgUrl = null;
      if (el.tagName === 'IMG') imgUrl = el.currentSrc || el.src;
      else {
        var bm = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(s.backgroundImage || '');
        if (bm) imgUrl = bm[1];
      }
      if (imgUrl && /^data:image\//i.test(imgUrl)) {
        fills.push({ type: 'IMAGE', scaleMode: 'FILL', dataUri: imgUrl });
      } else {
        var bg = solidFill(parseColor(s.backgroundColor));
        if (bg) fills.push(bg);
      }
      if (fills.length) node.fills = fills;
      var st = borderStroke(s);
      if (st) { node.strokes = [st.stroke]; node.strokeWeight = st.weight; }
      var rad = radii(s);
      if (typeof rad === 'number') { if (rad > 0) node.cornerRadius = rad; } else node.rectangleCornerRadii = rad;
      var sh = parseShadow(s.boxShadow);
      if (sh) node.effects = [sh];
      var op = Number(s.opacity);
      if (isFinite(op) && op < 1) node.opacity = op;
      if (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.overflowY === 'hidden') node.clipsContent = true;
      var children = [];
      for (var i = 0; i < el.childNodes.length; i++) {
        var ch = el.childNodes[i];
        if (ch.nodeType === 1) {
          if (SKIP[ch.tagName]) continue;
          var c = elementNode(ch);
          if (c) children.push(c);
        } else if (ch.nodeType === 3) {
          var text = ch.nodeValue;
          if (!text || !text.trim()) continue;
          var t = textNode(ch, text, s);
          if (t) children.push(t);
        }
      }
      if (children.length) node.children = children;
      return node;
    }
    function textNode(child, text, s) {
      if (count >= MAX_NODES) return null;
      var r = textRect(child);
      if (!r || r.width <= 0 || r.height <= 0) return null;
      count++;
      var family = firstFamily(s.fontFamily);
      var italic = s.fontStyle === 'italic' || s.fontStyle === 'oblique';
      var style = fontStyleName(s.fontWeight, italic);
      (fonts[family] = fonts[family] || {})[style] = 1;
      var lh = s.lineHeight === 'normal' ? 0 : px(s.lineHeight);
      var ls = px(s.letterSpacing);
      var align = s.textAlign === 'center' ? 'CENTER' : (s.textAlign === 'right' || s.textAlign === 'end') ? 'RIGHT'
        : s.textAlign === 'justify' ? 'JUSTIFIED' : 'LEFT';
      var color = parseColor(s.color) || { r: 0, g: 0, b: 0, a: 1 };
      var n = { type: 'TEXT', name: text.trim().slice(0, 40), x: r.left + sx, y: r.top + sy,
        width: Math.ceil(r.width) + 1, height: Math.ceil(r.height),
        characters: text.replace(/\s+/g, ' ').trim(), fontFamily: family, fontStyle: style,
        fontSize: px(s.fontSize) || 16, textAlign: align,
        color: { r: color.r, g: color.g, b: color.b }, opacity: color.a };
      if (lh) n.lineHeight = lh;
      if (ls) n.letterSpacing = ls;
      return n;
    }
    var root = elementNode(document.body) || { type: 'FRAME', name: 'body', x: 0, y: 0,
      width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
    return {
      version: 1,
      source: { url: 'fidesign://preview', title: document.title || 'FUNIBER Design', capturedAt: Date.now(),
        viewport: { width: window.innerWidth, height: window.innerHeight }, dpr: window.devicePixelRatio || 1 },
      fonts: Object.keys(fonts).map(function (f) { return { family: f, styles: Object.keys(fonts[f]) }; }),
      root: root
    };
  }
  window.__fidesignCapture = capture;
  function send() {
    var ir = null, error = null;
    try { ir = capture(); } catch (e) { error = String(e && e.message || e); }
    parent.postMessage({ type: ${JSON.stringify(CAPTURE_MESSAGE_RESULT)}, ir: ir, error: error }, '*');
  }
  window.addEventListener('message', function (ev) {
    if (ev.source !== parent) return;
    if (ev.data && ev.data.type === ${JSON.stringify(CAPTURE_MESSAGE_REQUEST)}) send();
  });
  if (document.readyState === 'complete') setTimeout(send, 50);
  else window.addEventListener('load', function () { setTimeout(send, 50); });
})();
`;
