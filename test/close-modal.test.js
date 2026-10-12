/**
 * The back button runs android/app/src/main/assets/dsh-close-modal.js in the
 * DSH page. It must close the topmost visible dialog and report true, and
 * report false (touching nothing) when no dialog is open.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const script = readFileSync(join(root, "android/app/src/main/assets/dsh-close-modal.js"), "utf8");

function modal({ visible = true, closeBtn = true } = {}) {
  const m = {
    clicks: 0,
    visible,
    getClientRects: () => (m.visible ? [{}] : []),
    querySelector: () => (closeBtn ? { click: () => { m.clicks++; } } : null),
  };
  return m;
}

function run(modals) {
  const events = [];
  const active = { dispatchEvent: (e) => { events.push(e); return true; } };
  const ctx = {
    document: { querySelectorAll: () => modals, activeElement: active, body: active },
    window: { getComputedStyle: () => ({ visibility: "visible", display: "block" }) },
    KeyboardEvent: class { constructor(type, o) { this.type = type; Object.assign(this, o); } },
  };
  return { result: vm.runInNewContext(script, ctx), events };
}

test("returns false and does nothing when no dialog is open", () => {
  const hidden = modal({ visible: false });
  const { result, events } = run([hidden]);
  assert.equal(result, false);
  assert.equal(hidden.clicks, 0);
  assert.equal(events.length, 0);
});

test("clicks the close button of the topmost visible dialog", () => {
  const below = modal();
  const top = modal();
  const { result } = run([below, top]);
  assert.equal(result, true);
  assert.equal(top.clicks, 1);
  assert.equal(below.clicks, 0);
});

test("falls back to Escape when the dialog has no close button", () => {
  const { result, events } = run([modal({ closeBtn: false })]);
  assert.equal(result, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].key, "Escape");
});
