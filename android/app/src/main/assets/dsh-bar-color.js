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
 */
(function () {
  var body = document.body;
  var html = document.documentElement;
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
})()
