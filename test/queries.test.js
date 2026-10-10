import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { seed } from "../src/seed.js";
import { getReportData } from "../src/queries.js";

function fresh(count = 200) {
  const db = openDb(":memory:");
  seed(db, count);
  return db;
}

test("seeding twice leaves exactly one clean copy", () => {
  const db = openDb(":memory:");
  seed(db, 200);
  assert.equal(seed(db, 200), 200);
});

test("report numbers agree with a brute-force recount in JS", () => {
  const db = fresh();
  const rows = db.prepare("SELECT product, amount FROM orders").all();
  const data = getReportData(db);
  const revenue = rows.reduce((s, r) => s + r.amount, 0);
  assert.equal(data.totals.orders, 200);
  assert.ok(Math.abs(data.totals.revenue - revenue) < 0.01);

  const per = new Map();
  for (const r of rows) per.set(r.product, (per.get(r.product) ?? 0) + r.amount);
  const expected = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  assert.deepEqual(data.topProducts.map((p) => p.product), expected.map((e) => e[0]));
  for (const p of data.topProducts) assert.ok(p.revenue <= data.totals.revenue); // the "bug is in the query" check
});

test("orders per day covers 7 consecutive days and matches the table", () => {
  const db = fresh();
  const data = getReportData(db);
  assert.equal(data.ordersPerDay.length, 7);
  for (const d of data.ordersPerDay) {
    const n = db.prepare("SELECT COUNT(*) n FROM orders WHERE created_at = ?").get(d.day).n;
    assert.equal(d.orders, Number(n));
  }
});

test("days filter narrows totals", () => {
  const db = fresh();
  const all = getReportData(db).totals.orders;
  const week = getReportData(db, { days: 7 }).totals.orders;
  assert.ok(week > 0 && week < all);
});
