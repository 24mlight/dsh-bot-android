/*
 * Run in the page by MainActivity every half second. Returns the colour the
 * page shows along its top edge as "#rrggbb", or "" when none is found.
 * It starts from the element under the top-centre point and walks up to the
 * first opaque background, so a full-screen layer such as DSH's
 * "HARNESS / Loading plugins…" boot screen counts even though it covers a
 * different <body> colour. It then falls back to <body>, <body>'s ::before,
 * <html>, <html>'s ::before (the Liquid Glass skin paints its wallpaper on
 * body::before and leaves <body> transparent). MainActivity paints the
 * status bar and gesture bar with it, so they follow DSH's own light/dark
 * switch instead of the phone's system theme. Must stay a single expression
 * (evaluateJavascript).
 *
 * Measuring makes the page settle its styles and layout on the spot, which
 * mid-animation costs a frame. So the colour is measured at once only when
 * a theme signal changed (DSH's dark attribute, the system scheme, the
 * address); otherwise the last colour is returned and a fresh measurement
 * waits for the page's idle time, at most once a second (the boot screen
 * giving way to DSH changes no signal).
 */
(function () {
  var REFRESH_MS = 1000;
  var body = document.body;
  var html = document.documentElement;

  function measure() {
    var targets = [];
    var el = typeof document.elementFromPoint === 'function'
      ? document.elementFromPoint((window.innerWidth || 0) / 2, 0)
      : null;
    for (; el && el !== body && el !== html; el = el.parentElement) targets.push([el, null]);
    targets.push([body, null], [body, '::before'], [html, null], [html, '::before']);
    for (var i = 0; i < targets.length; i++) {
      if (!targets[i][0]) continue;
      var m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(
        window.getComputedStyle(targets[i][0], targets[i][1]).backgroundColor || ''
      );
      if (!m) continue;
      var a = m[4] === undefined ? 1 : m[4].slice(-1) === '%' ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (!(a >= 0.99)) continue;
      var hex = '#';
      for (var k = 1; k <= 3; k++) {
        var v = Math.max(0, Math.min(255, parseInt(m[k], 10)));
        hex += (v < 16 ? '0' : '') + v.toString(16);
      }
      return hex;
    }
    return '';
  }

  var dark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var key = [
    body && typeof body.getAttribute === 'function' && body.getAttribute('data-ds-dark-theme') !== null,
    dark,
    typeof location === 'object' && location ? location.href : '',
  ].join('|');
  var last = window.__dshBarColor;
  var now = Date.now();
  if (!last || last.key !== key) {
    window.__dshBarColor = { key: key, color: measure(), at: now, waiting: false };
    return window.__dshBarColor.color;
  }
  if (!last.waiting && now - last.at >= REFRESH_MS) {
    last.waiting = true;
    var later = function () {
      last.waiting = false;
      last.color = measure();
      last.at = Date.now();
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(later, { timeout: 2000 });
    else setTimeout(later, 0);
  }
  return last.color;
})()
