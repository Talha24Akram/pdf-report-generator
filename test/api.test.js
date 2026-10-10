import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { seed } from "../src/seed.js";
import { renderPdf } from "../src/render.js";

let dir, server, base, db, fakeCalls;

// A slow fake renderer, so two requests really do overlap. One test below uses the real browser.
const slowFake = async (_html, path) => {
  fakeCalls++;
  await new Promise((r) => setTimeout(r, 150));
  await writeFile(path, "%PDF-fake");
};
let useReal = false;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "reports-"));
  db = openDb(":memory:");
  seed(db, 200);
  const app = createApp({ db, reportsDir: dir, render: (h, p) => (useReal ? renderPdf(h, p) : slowFake(h, p)) });
  await new Promise((r) => (server = app.listen(0, r)));
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const post = (body = {}) => fetch(`${base}/reports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const pdfs = async () => (await readdir(dir)).filter((f) => f.endsWith(".pdf") && !f.startsWith(".tmp"));

test("unknown id -> 404, junk id -> 404", async () => {
  assert.equal((await fetch(`${base}/reports/999`)).status, 404);
  assert.equal((await fetch(`${base}/reports/abc`)).status, 404);
  assert.equal((await fetch(`${base}/reports/999/file`)).status, 404);
});

test("bad options -> 400", async () => {
  assert.equal((await post({ days: -3 })).status, 400);
  assert.equal((await post({ days: "7" })).status, 400);
});

test("two rapid POSTs -> same id, one file; force -> a new one", async () => {
  fakeCalls = 0;
  const [a, b] = await Promise.all([post(), post()]);
  const [ja, jb] = [await a.json(), await b.json()];
  assert.equal(ja.id, jb.id);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]); // one created it, one got the existing one
  assert.equal(fakeCalls, 1);
  assert.equal((await pdfs()).length, 1);

  const later = await post(); // finished report exists now -> still the same one
  assert.equal(later.status, 200);
  assert.equal((await later.json()).id, ja.id);

  const forced = await post({ force: true });
  assert.equal(forced.status, 201);
  assert.notEqual((await forced.json()).id, ja.id);
  assert.equal((await pdfs()).length, 2);
});

test("different options are a different report", async () => {
  const r = await post({ days: 7 });
  assert.equal(r.status, 201);
  assert.deepEqual((await r.json()).params, { days: 7 });
});

test("real Chromium: file link serves a PDF of >= 2 pages", async () => {
  useReal = true;
  const created = await (await post({ force: true })).json();
  useReal = false;
  const res = await fetch(`${base}${created.file}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const pages = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  assert.ok(pages >= 2, `expected >= 2 pages, got ${pages}`);
});
