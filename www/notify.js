/*
 * 消息通知 on the setup page. Only inside the app (the native DshNotify
 * plugin); in a plain browser the section stays hidden.
 *
 * The switch turns the notice service on or off (Android asks for the
 * notification permission the first time). Below it, two shortcuts open the
 * system pages the app cannot change itself: the notification page (banner,
 * lock screen, sound) and background running / auto-start. The last line
 * says what the background service last heard from the server, and
 * 发送测试通知 asks the server to push one notice through the whole path.
 * 诊断记录 shows, for a screenshot, the app's own log and what the server's
 * plugin decided for the last turns (sent, or why not).
 */
(function () {
  "use strict";
  var cap = window.Capacitor;
  if (!cap || typeof cap.nativePromise !== "function") return;
  var $ = function (id) { return document.getElementById(id); };
  var box = $("notify");
  if (!box) return;

  var DEFAULT_HINT = "Bot、群聊或 DSH Agent 回复时，用横幅和锁屏通知提醒你。";
  var state = null;

  function call(method, options) {
    return cap.nativePromise("DshNotify", method, options || {});
  }

  /** The line under the switch: what is still missing for notices to arrive. */
  function hintOf(s) {
    if (!s.enabled) return DEFAULT_HINT;
    if (!s.allowed) return "通知权限被关掉了：点「通知样式」把通知打开。";
    if (!s.loggedIn) return "登录一次之后才能收到通知。";
    if (s.loginLost) return "登录已失效：重新登录后会自动恢复通知。";
    if (!s.batteryExempt) return "已开启。还要点「后台与自启动」允许后台运行和自启动，否则 App 不在前台时收不到。";
    return "已开启。横幅、锁屏和声音可以在「通知样式」里调整。";
  }

  // What the background service found the last time it asked the server.
  var POLL = {
    "ok": "连接正常",
    "not-installed": "服务器没有 dsh-notify 插件（装好后要重启 dsh-web）",
    "login-lost": "服务器不接受登录，请重新登录",
    "no-login": "还没登录",
    "network": "连不上服务器（网络或被系统限制了后台）",
    "bad-answer": "服务器的回答不对（插件版本或地址有误）",
    "stopped": "后台服务已停止"
  };
  var TEST = {
    "sent": "已发送：几秒内应该弹出一条测试通知。没弹出的话，是后台服务没在运行或通知被系统拦了。",
    "not-installed": "服务器没有 dsh-notify 插件。装好后执行 systemctl restart dsh-web。",
    "login-lost": "服务器不接受这次登录，请重新登录后再试。",
    "no-login": "还没登录：先登录一次。",
    "network": "连不上服务器。",
    "bad-answer": "服务器的回答不对：检查插件是否是最新版本。"
  };

  function clock(ms) {
    var d = new Date(ms);
    var two = function (n) { return (n < 10 ? "0" : "") + n; };
    return two(d.getHours()) + ":" + two(d.getMinutes());
  }

  function time(ms) {
    var d = new Date(ms);
    var two = function (n) { return (n < 10 ? "0" : "") + n; };
    return clock(ms) + ":" + two(d.getSeconds());
  }

  var SERVER_ERROR = {
    "old-plugin": "服务器插件版本太旧，请更新 dsh-notify 到 0.1.3 并重启 dsh-web",
    "no-login": "还没登录",
    "network": "连不上服务器"
  };

  /** The 诊断记录 text: server side first, then the app's log, newest first. */
  function diagnosticsText(d) {
    var lines = [];
    var server = (d && d.server) || {};
    if (server.error) {
      lines.push("服务器：" + (SERVER_ERROR[server.error] || server.error));
    } else {
      lines.push("服务器插件 " + (server.version || "?") + "：收到事件 " + (server.events || 0) + " 个，结束的轮次 " + (server.turnEnds || 0) +
        " 次，最后一个事件 " + (server.lastEventAt ? time(server.lastEventAt) : "无") + "，已发通知 " + (server.seq || 0) + " 条");
      var decisions = (server.decisions || []).slice().reverse();
      if (decisions.length === 0) lines.push("（服务器还没处理过结束的轮次）");
      decisions.forEach(function (x) {
        lines.push(time(x.at) + "  " + x.sessionId + "（" + (x.kind || "?") + "，" + (x.trigger || "无发起者") + "，" + (x.reason || "?") + "）→ " + x.result);
      });
    }
    lines.push("");
    lines.push("手机：" + pollLine(d || {}));
    (d && d.log || []).slice().reverse().forEach(function (x) { lines.push(time(x.at) + "  " + x.text); });
    return lines.join("\n");
  }

  function pollLine(s) {
    if (!s.lastPoll) return "连接状态：还没有连接过服务器";
    var text = POLL[s.lastPoll] || (/^http-/.test(s.lastPoll) ? "服务器返回 " + s.lastPoll.slice(5) : s.lastPoll);
    return "连接状态：" + text + (s.lastPollAt ? "（" + clock(s.lastPollAt) + "）" : "");
  }

  function render(s) {
    state = s || {};
    box.hidden = false;
    var on = state.enabled === true;
    $("notify-toggle").setAttribute("aria-checked", on ? "true" : "false");
    $("notify-more").hidden = !on;
    $("notify-test-row").hidden = !on;
    $("notify-hint").textContent = hintOf(state);
    $("notify-state").textContent = pollLine(state);
  }

  function refresh() {
    return call("status").then(render).catch(function () { /* plugin missing: stay hidden */ });
  }

  $("notify-toggle").addEventListener("click", function () {
    var want = !(state && state.enabled === true);
    call("setEnabled", { enabled: want }).then(function (s) {
      render(s);
      if (want && s && s.enabled !== true) $("notify-hint").textContent = "没有通知权限，开不了。可以点「通知样式」手动允许。";
    }).catch(function () {
      $("notify-hint").textContent = "开启失败，请稍后再试。";
    });
  });

  $("notify-test").addEventListener("click", function () {
    $("notify-state").textContent = "正在请求服务器发送测试通知…";
    call("sendTest").then(function (s) {
      render(s);
      $("notify-state").textContent = TEST[s && s.test] || ("测试失败：" + ((s && s.test) || "未知错误"));
    }).catch(function () {
      $("notify-state").textContent = "测试失败：请稍后再试。";
    });
  });

  $("notify-diag").addEventListener("click", function () {
    var out = $("notify-log");
    out.hidden = false;
    out.textContent = "正在读取…";
    call("diagnostics").then(function (d) {
      out.textContent = diagnosticsText(d);
    }).catch(function () {
      out.textContent = "读取失败，请稍后再试。";
    });
  });

  $("notify-settings").addEventListener("click", function () { call("openNotificationSettings").catch(function () {}); });
  $("notify-battery").addEventListener("click", function () { call("openBatterySettings").catch(function () {}); });

  // Back from a system settings page: show what changed.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refresh();
  });

  refresh();
})();
