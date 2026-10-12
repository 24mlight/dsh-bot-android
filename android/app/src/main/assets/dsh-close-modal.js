/*
 * Run in the DSH page by MainActivity when the back button is pressed.
 * Closes the topmost open dialog / sheet and returns true; returns false
 * when nothing is open, so the app goes on to its normal back handling.
 * Dialogs do not create history entries, so WebView.canGoBack() cannot
 * tell they are open. Must stay a single expression (evaluateJavascript).
 */
(function () {
  var sel = '[role="dialog"][aria-modal="true"],[data-shortcut-modal],.bt-settings,.bt-panel,.bt-pane';
  var nodes = document.querySelectorAll(sel);
  var modal = null;
  for (var i = nodes.length - 1; i >= 0; i--) {
    var n = nodes[i];
    var cs = window.getComputedStyle(n);
    if (n.getClientRects().length && cs.visibility !== "hidden" && cs.display !== "none") {
      modal = n;
      break;
    }
  }
  if (!modal) return false;
  var close = modal.querySelector(
    'button[aria-label*="lose" i],button[aria-label*="关闭"],button[title*="lose" i],button[title*="关闭"]'
  );
  if (close) {
    close.click();
  } else {
    var opts = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", opts));
  }
  return true;
})();
