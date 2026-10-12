/**
 * Unit tests for the Android shell's inline logic (www/index.html).
 *
 * Extracts the real <script> from the page and runs it against DOM /
 * localStorage / Capacitor stubs, then exercises the address parser, the
 * login flow (native DshNav.open, never location.assign), prefill without
 * auto-enter, and the reset flow. Zero deps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "www/index.html"), "utf8");
// The page's main script: the last inline one (the first is the launch intro).
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

/** Run the shell script with stubs; returns an interactive harness. */
function launchShell(savedConfig, session = new Map(), { native = true, nativeRejects = false } = {}) {
  const els = {};
  const makeEl = (id) => ({
    id, value: "", textContent: "", style: { display: "none" },
    handlers: {},
    attrs: {},
    addEventListener(ev, fn) { this.handlers[ev] = fn; },
    setAttribute(k, v) { this.attrs[k] = v; },
  });
  for (const id of ["link", "status", "go", "forget", "reveal"]) els[id] = makeEl(id);
  els.link.type = "password";

  const store = new Map(Object.entries(savedConfig ? { "dsh-bot.config": JSON.stringify(savedConfig) } : {}));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };

  const sessionStorage = {
    getItem: (k) => (session.has(k) ? session.get(k) : null),
    setItem: (k, v) => session.set(k, v),
    removeItem: (k) => session.delete(k),
  };

  const navigations = [];   // URLs handed to the native plugin
  const assigns = [];       // script navigations: must stay empty (T10)
  const nativeCalls = [];
  const window = {
    location: {
      assign(url) { assigns.push(url); },
      replace(url) { assigns.push(url); },
      set href(url) { assigns.push(url); },
    },
    setTimeout(fn) { fn(); }, // run timers synchronously in tests
    handlers: {},
    addEventListener(ev, fn) { this.handlers[ev] = fn; },
  };
  if (native) {
    window.Capacitor = {
      nativePromise(plugin, method, options) {
        nativeCalls.push({ plugin, method, options });
        if (plugin === "DshNav" && method === "open") navigations.push(options.url);
        return nativeRejects ? Promise.reject(new Error("url not allowed")) : Promise.resolve();
      },
    };
  }
  const document = { getElementById: (id) => els[id] };

  new Function("window", "document", "localStorage", "sessionStorage", script)(window, document, localStorage, sessionStorage);

  return {
    els,
    navigations,
    assigns,
    nativeCalls,
    saved: () => JSON.parse(store.get("dsh-bot.config") || "null"),
    clearSaved: () => store.delete("dsh-bot.config"),
    session,
    click: (id) => els[id].handlers.click(),
    pageshow: (persisted) => window.handlers.pageshow({ persisted }),
  };
}

const TOKEN = "AbCdEf1234567890_-Xy";
const BASE = "https://dsh.example.com";
const LINK = `${BASE}/?token=${TOKEN}`;

test("a full login link is opened as-is and saved", () => {
  const sh = launchShell(null);
  sh.els.link.value = LINK;
  sh.click("go");
  assert.equal(sh.navigations[0], LINK);
  assert.deepEqual(sh.saved(), { url: LINK });
});

test("any server works, with or without a token, http or https, any port", () => {
  for (const [typed, opened] of [
    ["https://dsh.example.com", "https://dsh.example.com/"],
    ["https://dsh.example.com/?token=abc", "https://dsh.example.com/?token=abc"],
    ["http://192.168.1.20:3080/?token=abc", "http://192.168.1.20:3080/?token=abc"],
    ["  https://other.example:8443/  ", "https://other.example:8443/"],
    ["dsh.example.com/?token=abc", "https://dsh.example.com/?token=abc"],
    ["http://nas:3080/", "http://nas:3080/"],
  ]) {
    const sh = launchShell(null);
    sh.els.link.value = typed;
    sh.click("go");
    assert.equal(sh.navigations[0], opened, typed);
  }
});

test("not an http(s) address: rejected without navigation", () => {
  for (const bad of ["", "   ", "short", "short token", "javascript:alert(1)", "file:///etc/hosts", "ftp://h/x", "https://user:pw@evil.example/", "https://"]) {
    const sh = launchShell(null);
    sh.els.link.value = bad;
    sh.click("go");
    assert.equal(sh.navigations.length, 0, bad);
    assert.equal(sh.saved(), null, bad);
    assert.equal(sh.els.status.style.display, "block", bad);
  }
});

test("a config saved by an older build (address + token apart) becomes one link", () => {
  const sh = launchShell({ baseUrl: BASE, token: TOKEN });
  assert.equal(sh.els.link.value, LINK);
  sh.click("go");
  assert.equal(sh.navigations[0], LINK);
  assert.deepEqual(sh.saved(), { url: LINK });
});

test("the setup page no longer pins one server", () => {
  const cfg = JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8"));
  assert.equal(cfg.server.allowNavigation, undefined, "no hard-coded allowNavigation");
  assert.ok(!/ALLOWED_ORIGINS/.test(script));
  assert.ok(!/id="base"/.test(html), "one address field only");
});

test("saved address is prefilled but never auto-enters", () => {
  const sh = launchShell({ url: LINK });
  assert.equal(sh.navigations.length, 0);
  assert.equal(sh.els.link.value, LINK);
  assert.equal(sh.els.link.type, "password");        // token masked by default
  sh.click("go");
  assert.equal(sh.navigations[0], LINK);
});

test("reset clears the saved config only", () => {
  const sh = launchShell(null);
  sh.els.link.value = LINK;
  sh.click("go");
  assert.ok(sh.saved());
  sh.click("forget");
  assert.equal(sh.saved(), null);
  assert.equal(sh.els.link.value, "");
});

test("the address (and its token) never leaks into element text", () => {
  const sh = launchShell(null);
  sh.els.link.value = LINK;
  sh.click("go");
  assert.ok(!sh.els.status.textContent.includes(TOKEN));
  const bad = launchShell(null);
  bad.els.link.value = `ftp://x/?token=${TOKEN}`;
  bad.click("go");
  assert.ok(!bad.els.status.textContent.includes(TOKEN));
});

test("returning via back button prefills and does not auto-enter", () => {
  const first = launchShell(null);
  first.els.link.value = LINK;
  first.click("go");
  const back = launchShell({ url: LINK }, first.session);
  assert.equal(back.navigations.length, 0);
  assert.equal(back.els.link.value, LINK);
  assert.equal(back.els.status.style.display, "block");
  assert.ok(!back.els.status.textContent.includes(TOKEN));
});

test("after returning, the link can be replaced and reset works", () => {
  const first = launchShell(null);
  first.els.link.value = LINK;
  first.click("go");
  const back = launchShell({ url: LINK }, first.session);
  const NEW = `${BASE}/?token=NewToken_0987654321-zz`;
  back.els.link.value = NEW;
  back.click("go");
  assert.equal(back.navigations[0], NEW);
  assert.deepEqual(back.saved(), { url: NEW });
  back.click("forget");
  assert.equal(back.saved(), null);
});

test("cold start never auto-enters", () => {
  const cold = launchShell({ url: LINK }, new Map());
  assert.equal(cold.navigations.length, 0);
  assert.equal(cold.assigns.length, 0);
});

test("login goes through native DshNav.open, never a script navigation (T10)", () => {
  const sh = launchShell(null);
  sh.els.link.value = LINK;
  sh.click("go");
  assert.deepEqual(sh.nativeCalls, [
    { plugin: "DshNav", method: "open", options: { url: LINK } },
  ]);
  assert.equal(sh.assigns.length, 0);
  assert.ok(!/location\.(assign|replace|href)\s*[(=]/.test(script), "no script navigation in the shell");
});

test("outside the app (no native bridge) login does nothing and says why", () => {
  const sh = launchShell(null, new Map(), { native: false });
  sh.els.link.value = LINK;
  sh.click("go");
  assert.equal(sh.assigns.length, 0);
  assert.equal(sh.saved(), null);
  assert.equal(sh.els.status.style.display, "block");
});

test("native rejection is shown to the user", async () => {
  const sh = launchShell(null, new Map(), { nativeRejects: true });
  sh.els.link.value = LINK;
  sh.click("go");
  await new Promise((r) => setImmediate(r));
  assert.equal(sh.els.status.style.display, "block");
  assert.ok(!sh.els.status.textContent.includes(TOKEN));
});

test("reveal toggles the address field between masked and visible", () => {
  const sh = launchShell(null);
  sh.click("reveal");
  assert.equal(sh.els.link.type, "text");
  assert.equal(sh.els.reveal.attrs["aria-pressed"], "true");
  sh.click("reveal");
  assert.equal(sh.els.link.type, "password");
});

test("setup page uses no gradients (design rule)", () => {
  assert.ok(!/gradient\(/.test(html));
});

test("登录 shows a busy state while the remote page loads", () => {
  const sh = launchShell(null);
  sh.els.link.value = LINK;
  sh.click("go");
  assert.equal(sh.navigations.length, 1);
  assert.equal(sh.els.go.disabled, true);
  assert.equal(sh.els.go.textContent, "登录中…");
  assert.equal(sh.els.go.attrs["aria-busy"], "true");
  assert.equal(sh.els.status.style.display, "block");
});

test("a rejected open or a page restored by Back clears the busy state", async () => {
  const sh = launchShell(null, new Map(), { nativeRejects: true });
  sh.els.link.value = LINK;
  sh.click("go");
  await new Promise((r) => setImmediate(r));
  assert.equal(sh.els.go.disabled, false);
  assert.equal(sh.els.go.textContent, "登录");
  assert.match(sh.els.status.textContent, /打开失败/);

  const back = launchShell(null);
  back.els.link.value = LINK;
  back.click("go");
  back.pageshow(true);
  assert.equal(back.els.go.disabled, false);
  assert.equal(back.els.go.attrs["aria-busy"], "false");
  assert.match(back.els.status.textContent, /已返回设置页/);
});

test("invalid input never enters the busy state", () => {
  const sh = launchShell(null);
  sh.els.link.value = "short";
  sh.click("go");
  assert.notEqual(sh.els.go.textContent, "登录中…");
  assert.equal(sh.navigations.length, 0);
});
