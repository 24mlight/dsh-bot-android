/**
 * The login token is stored in WebView localStorage (app_webview/), so the
 * manifest must point at backup rules that exclude it on every API level.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const res = (p) => readFileSync(join(root, "android/app/src/main", p), "utf8");
const manifest = res("AndroidManifest.xml");
const EXCLUDE = /<exclude\s+domain="root"\s+path="app_webview\/"\s*\/>/;

test("manifest wires both backup rule files", () => {
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  assert.match(manifest, /android:fullBackupContent="@xml\/backup_rules"/);
});

test("Android 12+ rules exclude WebView storage from cloud backup and device transfer", () => {
  const xml = res("res/xml/data_extraction_rules.xml");
  for (const section of ["cloud-backup", "device-transfer"]) {
    const body = xml.match(new RegExp(`<${section}>([\\s\\S]*?)</${section}>`));
    assert.ok(body, `${section} section present`);
    assert.match(body[1], EXCLUDE, `${section} excludes app_webview/`);
  }
});

test("Android 11 and below rules exclude WebView storage", () => {
  assert.match(res("res/xml/backup_rules.xml"), EXCLUDE);
});
