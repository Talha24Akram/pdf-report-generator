import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Report object -> a self-contained HTML page. Everything dynamic goes through esc(). */
export function buildHtml(data) {
  const period = data.days ? `last ${data.days} days` : "all time";
  const maxDay = Math.max(1, ...data.ordersPerDay.map((d) => d.orders));
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Sales report ${esc(data.generatedOn)}</title>
<style>
  :root { --brand: #7a4b2a; --ink: #222; --muted: #777; --line: #e3d9d0; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 "Helvetica Neue", Arial, sans-serif; color: var(--ink); margin: 0; }
  header { border-bottom: 3px solid var(--brand); padding-bottom: 10px; margin-bottom: 18px; }
  h1 { margin: 0; color: var(--brand); font-size: 26px; }
  .sub { color: var(--muted); }
  h2 { font-size: 15px; margin: 22px 0 8px; color: var(--brand); }
  .totals { display: flex; gap: 14px; }
  .card { flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; background: #fbf7f3; }
  .card .n { font-size: 24px; font-weight: 700; }
  .card .l { color: var(--muted); text-transform: uppercase; font-size: 10px; letter-spacing: .06em; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; background: var(--brand); color: #fff; padding: 6px 8px; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid var(--line); }
  td.r, th.r { text-align: right; }
  thead { display: table-header-group; }   /* repeat the header row on every page */
  tr { break-inside: avoid; }              /* never slice a row across a page break */
  .bar { display: inline-block; height: 9px; background: var(--brand); border-radius: 2px; vertical-align: middle; }
  .detail { break-before: page; }
</style></head><body>
<header>
  <h1>Sales report</h1>
  <div class="sub">Generated ${esc(data.generatedOn)} &middot; ${esc(period)}</div>
</header>

<div class="totals">
  <div class="card"><div class="n">${data.totals.orders}</div><div class="l">Orders</div></div>
  <div class="card"><div class="n">${money(data.totals.revenue)}</div><div class="l">Revenue</div></div>
</div>

<h2>Top 5 products by revenue</h2>
<table>
  <thead><tr><th>Product</th><th class="r">Orders</th><th class="r">Revenue</th></tr></thead>
  <tbody>${data.topProducts.map((p) => `<tr><td>${esc(p.product)}</td><td class="r">${p.orders}</td><td class="r">${money(p.revenue)}</td></tr>`).join("")}</tbody>
</table>

<h2>Orders per day, last 7 days</h2>
<table>
  <thead><tr><th>Day</th><th class="r">Orders</th><th></th></tr></thead>
  <tbody>${data.ordersPerDay
    .map((d) => `<tr><td>${esc(d.day)}</td><td class="r">${d.orders}</td><td><span class="bar" style="width:${Math.round((d.orders / maxDay) * 220)}px"></span></td></tr>`)
    .join("")}</tbody>
</table>

<h2 class="detail">All orders (${data.orders.length})</h2>
<table>
  <thead><tr><th>#</th><th>Date</th><th>Customer</th><th>Product</th><th class="r">Amount</th></tr></thead>
  <tbody>${data.orders
    .map((o) => `<tr><td>${o.id}</td><td>${esc(o.created_at)}</td><td>${esc(o.customer)}</td><td>${esc(o.product)}</td><td class="r">${money(o.amount)}</td></tr>`)
    .join("")}</tbody>
</table>
</body></html>`;
}

/** HTML -> PDF with headless Chromium. CHROMIUM_PATH lets you point at an existing browser. */
export async function renderPdf(html, path) {
  await mkdir(dirname(path), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path,
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:9px;color:#777;width:100%;text-align:center">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
    });
  } finally {
    await browser.close();
  }
}
