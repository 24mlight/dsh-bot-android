/**
 * Tests for www/notify.js, the 消息通知 switch on the setup page: hidden
 * outside the app, shows the native status, toggles through DshNotify, says
 * what is still missing, and opens the two system pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "www/notify.js"), "utf8");
const html = readFileSync(join(root, "www/index.html"), "utf8");

function run({ native = true, status = {}, afterSet = null, testResult = "sent", diagnostics = {} } = {}) {
  const els = {};
  const el = (id) => (els[id] ??= {
    id, hidden: ["notify", "notify-more", "notify-test-row", "notify-log"].includes(id), textContent: "", attrs: {}, handlers: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(ev, fn) { this.handlers[ev] = fn; },
  });
  const calls = [];
  let current = { enabled: false, allowed: true, batteryExempt: false, loggedIn: true, loginLost: false, ...status };
  const docHandlers = {};
  const document = {
    hidden: false,
    getElementById: el,
    addEventListener(ev, fn) { docHandlers[ev] = fn; },
  };
  const window = {};
  if (native) {
    window.Capacitor = {
      nativePromise(plugin, method, options) {
        calls.push([plugin, method, options]);
        if (method === "sendTest") return Promise.resolve({ ...current, test: testResult });
        if (method === "diagnostics") return Promise.resolve({ ...current, ...diagnostics });
        if (method === "setEnabled") current = afterSet ? afterSet(options, current) : { ...current, enabled: options.enabled };
        return Promise.resolve(current);
      },
    };
  }
  vm.runInNewContext(source, { window, document, Promise });
  const tick = () => new Promise((r) => setImmediate(r));
  return { els, calls, tick, docHandlers, click: (id) => el(id).handlers.click() };
}

test("outside the app the section stays hidden and nothing is called", async () => {
  const r = run({ native: false });
  await r.tick();
  assert.equal(r.els.notify, undefined, "never touched");
  assert.deepEqual(r.calls, []);
});

test("in the app it shows the switch off, with what it does", async () => {
  const r = run();
  await r.tick();
  assert.equal(r.els.notify.hidden, false);
  assert.equal(r.els["notify-toggle"].attrs["aria-checked"], "false");
  assert.equal(r.els["notify-more"].hidden, true, "shortcuts only once it is on");
  assert.match(r.els["notify-hint"].textContent, /横幅和锁屏/);
});

test("turning it on calls DshNotify.setEnabled and suggests background running", async () => {
  const r = run();
  await r.tick();
  r.click("notify-toggle");
  await r.tick();
  const set = r.calls.find((c) => c[1] === "setEnabled");
  assert.equal(set[0], "DshNotify");
  assert.equal(set[2].enabled, true);
  assert.equal(r.els["notify-toggle"].attrs["aria-checked"], "true");
  assert.equal(r.els["notify-more"].hidden, false);
  assert.match(r.els["notify-hint"].textContent, /后台与自启动/);
});

test("permission refused: the switch stays off and says why", async () => {
  const r = run({ afterSet: (_o, cur) => ({ ...cur, enabled: false, allowed: false }) });
  await r.tick();
  r.click("notify-toggle");
  await r.tick();
  assert.equal(r.els["notify-toggle"].attrs["aria-checked"], "false");
  assert.match(r.els["notify-hint"].textContent, /没有通知权限/);
});

test("hints name what is missing: permission, login, lost login, all set", async () => {
  const cases = [
    [{ enabled: true, allowed: false }, /通知权限被关掉/],
    [{ enabled: true, loggedIn: false }, /登录一次/],
    [{ enabled: true, loginLost: true }, /登录已失效/],
    [{ enabled: true, batteryExempt: true }, /通知样式/],
  ];
  for (const [status, hint] of cases) {
    const r = run({ status });
    await r.tick();
    assert.match(r.els["notify-hint"].textContent, hint);
  }
});

test("the shortcuts open the system pages; coming back refreshes the status", async () => {
  const r = run({ status: { enabled: true } });
  await r.tick();
  r.click("notify-settings");
  r.click("notify-battery");
  r.docHandlers.visibilitychange();
  await r.tick();
  const methods = r.calls.map((c) => c[1]);
  assert.ok(methods.includes("openNotificationSettings"));
  assert.ok(methods.includes("openBatterySettings"));
  assert.equal(methods.filter((m) => m === "status").length, 2);
});

test("the page carries the section and loads notify.js", () => {
  for (const id of ["notify", "notify-toggle", "notify-hint", "notify-more", "notify-settings", "notify-battery", "notify-test", "notify-state", "notify-diag", "notify-log"]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /<section class="notify" id="notify" hidden>/);
  assert.match(html, /<script src="notify.js"><\/script>/);
});

test("the connection line says what the service last heard from the server", async () => {
  for (const [lastPoll, line] of [[null, /还没有连接过/], ["ok", /连接正常/], ["not-installed", /dsh-notify/], ["login-lost", /重新登录/], ["http-502", /502/]]) {
    const r = run({ status: { enabled: true, lastPoll, lastPollAt: lastPoll ? Date.now() : 0 } });
    await r.tick();
    assert.equal(r.els["notify-test-row"].hidden, false);
    assert.match(r.els["notify-state"].textContent, line, String(lastPoll));
  }
});

test("发送测试通知 calls DshNotify.sendTest and explains the result", async () => {
  for (const [result, line] of [["sent", /几秒内/], ["not-installed", /systemctl restart dsh-web/], ["network", /连不上/]]) {
    const r = run({ status: { enabled: true }, testResult: result });
    await r.tick();
    r.click("notify-test");
    await r.tick();
    assert.ok(r.calls.some((c) => c[1] === "sendTest"));
    assert.match(r.els["notify-state"].textContent, line, result);
  }
});

test("诊断记录 shows the server's decisions and the app's log, newest first", async () => {
  const at = new Date(2026, 9, 12, 0, 17, 5).getTime();
  const r = run({ status: { enabled: true, lastPoll: "ok", lastPollAt: at }, diagnostics: {
    server: { version: "0.1.3", events: 12, turnEnds: 2, lastEventAt: at, seq: 1, decisions: [
      { at, sessionId: "s-1", kind: "plain", trigger: "user", reason: "completed", result: "sent" },
      { at: at + 1000, sessionId: "s-2", kind: "plain", reason: "completed", result: "skip: not started by the user" },
    ] },
    log: [{ at, text: "后台服务启动" }, { at: at + 2000, text: "收到：DSH（reply）" }],
  } });
  await r.tick();
  r.click("notify-diag");
  await r.tick();
  const text = r.els["notify-log"].textContent;
  assert.equal(r.els["notify-log"].hidden, false);
  assert.match(text, /服务器插件 0\.1\.3：收到事件 12 个，结束的轮次 2 次/);
  assert.ok(text.indexOf("s-2") < text.indexOf("s-1"), "newest decision first");
  assert.match(text, /s-2（plain，无发起者，completed）→ skip: not started by the user/);
  assert.ok(text.indexOf("收到：DSH") < text.indexOf("后台服务启动"), "newest log line first");
});

test("诊断记录 says when the server plugin is too old; there is no 隐藏常驻通知 any more", async () => {
  const r = run({ status: { enabled: true }, diagnostics: { server: { error: "old-plugin" }, log: [] } });
  await r.tick();
  r.click("notify-diag");
  await r.tick();
  assert.match(r.els["notify-log"].textContent, /版本太旧/);
  assert.ok(!html.includes("notify-ongoing"), "the ongoing notice is hidden by the app itself");
});
