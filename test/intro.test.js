/**
 * Tests for the launch intro on the setup page (#intro in www/index.html):
 * the Orbit mark animates once per app start, starting from the launch
 * colour the system screen showed, and is skipped on returning from DSH and
 * for reduced motion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, "www/index.html"), "utf8");
const script = html.match(/<script>\s*(\/\/ The intro plays[\s\S]*?)<\/script>/)[1];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];

function run({ stored = {}, reduced = false } = {}) {
  const intro = { removed: false, handlers: {}, remove() { this.removed = true; }, addEventListener(ev, fn) { this.handlers[ev] = fn; } };
  const storage = { ...stored };
  const sessionStorage = { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = String(v); } };
  const window = { matchMedia: () => ({ matches: reduced }) };
  vm.runInNewContext(script, { document: { getElementById: () => intro }, sessionStorage, window });
  return { intro, storage };
}

test("the first start plays the intro and removes it after its fade", () => {
  const r = run();
  assert.equal(r.intro.removed, false);
  assert.equal(r.storage["dsh-bot.intro"], "1");
  r.intro.handlers.animationend({ target: {} });
  assert.equal(r.intro.removed, false, "a child's animation end does not remove it");
  r.intro.handlers.animationend({ target: r.intro });
  assert.equal(r.intro.removed, true);
});

test("returning from DSH or reduced motion skips it", () => {
  assert.equal(run({ stored: { "dsh-bot.intro": "1" } }).intro.removed, true);
  assert.equal(run({ reduced: true }).intro.removed, true);
});

test("the intro starts from the launch colours and draws the Orbit mark", () => {
  assert.match(html, /<div id="intro" aria-hidden="true">/);
  assert.match(style, /#intro \{[^}]*background: #ffffff/);
  assert.match(style, /prefers-color-scheme: dark\) \{\s*#intro \{ background: #000000/);
  assert.match(html, /class="ring" pathLength="1" d="M207\.71 121\.18A80 80 0 1 1 134\.83 48\.29"/);
  assert.match(html, /class="dot" cx="184\.57" cy="71\.43" r="26"/);
  // A stray "*/" inside a comment once ended it early and dropped the fade-out rule.
  assert.equal((style.match(/\/\*/g) ?? []).length, (style.match(/\*\//g) ?? []).length);
  assert.match(style, /#intro \{[^}]*animation: intro-out/);
});
