/**
 * www/backdrop.js draws the login page's particle nebula. Runs it against
 * a stub canvas: it must animate with requestAnimationFrame, stop while
 * the page is hidden, draw one still frame (and never animate) for
 * reduced motion, keep particles moving, and do nothing without a canvas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = readFileSync(join(root, "www/backdrop.js"), "utf8");

function ctx2d(calls) {
  return new Proxy({}, {
    get: (_t, k) => {
      if (k === "rect") return (x, y) => { calls.rects.push([x, y]); };
      if (k === "fill") return () => { calls.fill = (calls.fill || 0) + 1; };
      return () => {};
    },
    set: () => true,
  });
}

function run({ reduced = false, hidden = false, canvas = true, busy = false } = {}) {
  const calls = { rects: [] };
  const frames = [];
  const docListeners = {};
  const go = { getAttribute: (k) => (k === "aria-busy" && busy ? "true" : null) };
  const document = {
    hidden,
    getElementById: (id) => (id === "neural" ? (canvas ? { width: 0, height: 0, getContext: () => ctx2d(calls) } : null) : id === "go" ? go : null),
    addEventListener: (t, fn) => { docListeners[t] = fn; },
  };
  const window = {
    innerWidth: 390, innerHeight: 844, devicePixelRatio: 2,
    matchMedia: (q) => ({ matches: q.includes("reduced-motion") ? reduced : false, addEventListener() {} }),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    addEventListener() {},
  };
  vm.runInNewContext(script, { window, document, Math });
  return {
    calls, frames, document, docListeners,
    step(now) { calls.rects = []; calls.fill = 0; const fn = frames.shift(); if (fn) fn(now); },
  };
}

test("animates: every frame fills the field and queues the next one", () => {
  const r = run();
  assert.equal(r.frames.length, 1);
  r.step(16);
  const first = r.calls.rects.slice();
  for (let i = 2; i <= 200; i++) r.step(i * 16);
  assert.equal(r.frames.length, 1, "always exactly one frame queued");
  assert.ok(r.calls.rects.length > 3000, `thousands of particles drawn, got ${r.calls.rects.length}`);
  assert.ok(r.calls.fill <= 5, "batched into at most five paths");
  const moved = r.calls.rects.some((p, i) => first[i] && (p[0] !== first[i][0] || p[1] !== first[i][1]));
  assert.ok(moved, "particles move");
});

test("particles cover the whole screen, not just the clouds", () => {
  const r = run();
  r.step(16);
  const rows = new Set(r.calls.rects.map(([, y]) => Math.floor(y / 84)));
  assert.ok(rows.size >= 10, `particles in every tenth of the height, got ${rows.size}`);
});

test("stops while the page is hidden and resumes when shown", () => {
  const r = run();
  r.document.hidden = true;
  r.docListeners.visibilitychange();
  r.step(16);
  assert.equal(r.frames.length, 0, "no frame queued while hidden");
  r.document.hidden = false;
  r.docListeners.visibilitychange();
  assert.equal(r.frames.length, 1);
});

test("hidden at load: nothing runs until shown", () => {
  assert.equal(run({ hidden: true }).frames.length, 0);
});

test("reduced motion: one still frame, no animation", () => {
  const r = run({ reduced: true });
  assert.equal(r.frames.length, 0);
  assert.ok(r.calls.rects.length > 3000, "the still field is drawn");
});

test("no canvas: does nothing", () => {
  const r = run({ canvas: false });
  assert.equal(r.frames.length, 0);
  assert.equal(r.calls.rects.length, 0);
});
