/**
 * MainActivity paints the status bar and gesture bar with the colour that
 * android/app/src/main/assets/dsh-bar-color.js reads from the page, so the
 * bars follow DSH's own light/dark switch instead of the phone's theme. The
 * script must return the first opaque background under the top edge (the
 * element there and its ancestors), then on <body> and <html>, as "#rrggbb",
 * and "" when none is opaque.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = readFileSync(join(root, "android/app/src/main/assets/dsh-bar-color.js"), "utf8");

/**
 * `top` lists the elements under the top-centre point, innermost first, as
 * [name, background]; their chain ends at <body>.
 */
function run({ body, html, bodyBefore, htmlBefore, noBody = false, top = [] }) {
  const htmlEl = { n: "html", parentElement: null };
  const bodyEl = { n: "body", parentElement: htmlEl };
  const colors = { body, html, "body::before": bodyBefore, "html::before": htmlBefore };
  let parent = noBody ? htmlEl : bodyEl;
  let hit = parent;
  for (let i = top.length - 1; i >= 0; i--) {
    hit = { n: top[i][0], parentElement: parent };
    colors[top[i][0]] = top[i][1];
    parent = hit;
  }
  const ctx = {
    document: {
      body: noBody ? null : bodyEl,
      documentElement: htmlEl,
      elementFromPoint: () => hit,
    },
    window: {
      innerWidth: 400,
      getComputedStyle: (el, pseudo) => ({ backgroundColor: colors[el.n + (pseudo || "")] }),
    },
  };
  return vm.runInNewContext(script, ctx);
}

test("returns the body's opaque background as #rrggbb", () => {
  assert.equal(run({ body: "rgb(220, 227, 238)", html: "rgb(0, 0, 0)" }), "#dce3ee");
  assert.equal(run({ body: "rgb(15, 18, 32)" }), "#0f1220");
  assert.equal(run({ body: "rgba(255, 255, 255, 1)" }), "#ffffff");
});

test("falls through a transparent body to <html>", () => {
  assert.equal(run({ body: "rgba(0, 0, 0, 0)", html: "rgb(10, 20, 30)" }), "#0a141e");
  assert.equal(run({ body: "transparent", html: "rgb(1, 2, 3)" }), "#010203");
  assert.equal(run({ noBody: true, html: "rgb(255, 0, 16)" }), "#ff0010");
});

test("reads the skin's wallpaper on body::before when <body> itself is transparent", () => {
  assert.equal(run({ body: "rgba(0, 0, 0, 0)", bodyBefore: "rgb(220, 227, 238)", html: "rgba(0, 0, 0, 0)" }), "#dce3ee");
  assert.equal(run({ body: "rgba(0, 0, 0, 0)", bodyBefore: "rgb(15, 18, 32)", html: "rgb(255, 255, 255)" }), "#0f1220", "wallpaper wins over a white <html>");
  assert.equal(run({ body: "rgb(1, 2, 3)", bodyBefore: "rgb(9, 9, 9)" }), "#010203", "an opaque <body> still comes first");
  assert.equal(run({ body: "rgba(0, 0, 0, 0)", bodyBefore: "rgba(0, 0, 0, 0)", html: "rgba(0, 0, 0, 0)", htmlBefore: "rgb(5, 6, 7)" }), "#050607");
});

test("translucent or missing backgrounds give an empty string", () => {
  assert.equal(run({ body: "rgba(10, 20, 30, 0.5)", html: "rgba(0, 0, 0, 0)" }), "");
  assert.equal(run({ body: "", html: "" }), "");
  assert.equal(run({ body: "color(srgb 1 1 1)", html: "oklch(0.9 0 0)" }), "");
});

test("accepts the space-separated rgb() syntax", () => {
  assert.equal(run({ body: "rgb(220 227 238)" }), "#dce3ee");
  assert.equal(run({ body: "rgb(220 227 238 / 1)" }), "#dce3ee");
  assert.equal(run({ body: "rgb(220 227 238 / 50%)" }), "");
});

test("a full-screen layer over <body> wins, like DSH's boot screen", () => {
  // <div id=root><div class=_boot> painted with Canvas over a white <body>.
  const boot = { body: "rgb(255, 255, 255)", top: [["boot", "rgb(18, 18, 18)"], ["root", "rgba(0, 0, 0, 0)"]] };
  assert.equal(run(boot), "#121212");
  assert.equal(run({ ...boot, top: [["boot", "rgb(250, 250, 250)"], ["root", "rgba(0, 0, 0, 0)"]] }), "#fafafa");
});

test("walks up past translucent glass under the top edge to the wallpaper", () => {
  const glass = [["pill", "rgba(255, 255, 255, 0.4)"], ["header", "rgba(0, 0, 0, 0)"], ["root", "rgba(0, 0, 0, 0)"]];
  assert.equal(run({ top: glass, body: "rgba(0, 0, 0, 0)", bodyBefore: "rgb(12, 16, 32)" }), "#0c1020");
  assert.equal(run({ top: [["inner", "rgba(0, 0, 0, 0)"], ["bar", "rgb(1, 2, 3)"]], body: "rgb(9, 9, 9)" }), "#010203", "an opaque ancestor beats <body>");
});

test("still works where elementFromPoint finds nothing", () => {
  const ctx = {
    document: { body: { n: "body" }, documentElement: { n: "html" }, elementFromPoint: () => null },
    window: { getComputedStyle: () => ({ backgroundColor: "rgb(1, 2, 3)" }) },
  };
  assert.equal(vm.runInNewContext(script, ctx), "#010203");
});

/** One page, polled several times: the context (and the script's cache)
 * persists between runs, like the real page between polls. */
function page() {
  const colors = { body: "rgb(255, 255, 255)" };
  const bodyEl = { n: "body", attrs: {}, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } };
  const idle = [];
  let measured = 0;
  let clock = 1000;
  const ctx = vm.createContext({
    document: { body: bodyEl, documentElement: { n: "html" }, elementFromPoint: () => null },
    window: {
      innerWidth: 400,
      getComputedStyle: (el, pseudo) => { measured++; return { backgroundColor: colors[el.n + (pseudo || "")] }; },
      requestIdleCallback: (fn) => idle.push(fn),
    },
    location: { href: "https://dsh.example/chat/1" },
  });
  vm.runInContext("Date.now = () => globalThis.__clock", ctx);
  const poll = () => { ctx.__clock = clock; return vm.runInContext(script, ctx); };
  return {
    poll, colors, bodyEl, ctx, idle,
    measured: () => measured,
    advance(ms) { clock += ms; },
    runIdle() { ctx.__clock = clock; while (idle.length) idle.shift()(); },
  };
}

test("between theme changes a poll reads nothing from the page", () => {
  const p = page();
  assert.equal(p.poll(), "#ffffff");
  const after = p.measured();
  p.colors.body = "rgb(1, 2, 3)";
  p.advance(500);
  assert.equal(p.poll(), "#ffffff", "the last colour, no measuring");
  assert.equal(p.measured(), after, "no style or layout read mid-animation");
});

test("DSH's dark switch is picked up on the next poll", () => {
  const p = page();
  p.poll();
  p.colors.body = "rgb(15, 18, 32)";
  p.bodyEl.attrs["data-ds-dark-theme"] = "";
  assert.equal(p.poll(), "#0f1220");
});

test("a change with no theme signal (the boot screen going) is measured in idle time", () => {
  const p = page();
  p.poll();
  p.colors.body = "rgb(18, 18, 18)";
  p.advance(1000);
  assert.equal(p.poll(), "#ffffff", "still the old colour this poll");
  assert.equal(p.idle.length, 1, "a measurement waits for idle time");
  p.poll();
  assert.equal(p.idle.length, 1, "only one at a time");
  p.runIdle();
  assert.equal(p.poll(), "#121212", "the next poll has it");
});
