/**
 * The aggregation behind the report. Four sections, all plain SQL:
 *  - totals: COUNT + SUM over all orders (optionally only the last `days` days)
 *  - topProducts: GROUP BY product, top 5 by revenue
 *  - ordersPerDay: one row per day for the last 7 days (days with no orders show 0)
 *  - orders: the full detail list for the long table at the bottom
 * Dates are UTC `YYYY-MM-DD` strings, the same way the seed writes them.
 */
const DAY = 86400000;
const isoDay = (offsetDays = 0) => new Date(Date.now() - offsetDays * DAY).toISOString().slice(0, 10);

export function getReportData(db, { days = null } = {}) {
  const since = days ? isoDay(days - 1) : "0000-01-01"; // `days: 7` = today and the 6 days before
  const totals = db
    .prepare("SELECT COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS revenue FROM orders WHERE created_at >= ?")
    .get(since);

  const topProducts = db
    .prepare(
      `SELECT product, COUNT(*) AS orders, SUM(amount) AS revenue
         FROM orders WHERE created_at >= ?
        GROUP BY product ORDER BY revenue DESC LIMIT 5`,
    )
    .all(since);

  const perDayRows = db
    .prepare("SELECT created_at AS day, COUNT(*) AS orders FROM orders WHERE created_at >= ? GROUP BY created_at")
    .all(isoDay(6));
  const byDay = new Map(perDayRows.map((r) => [r.day, r.orders]));
  const ordersPerDay = Array.from({ length: 7 }, (_, i) => {
    const day = isoDay(6 - i);
    return { day, orders: byDay.get(day) ?? 0 };
  });

  const orders = db
    .prepare("SELECT id, customer, product, amount, created_at FROM orders WHERE created_at >= ? ORDER BY created_at DESC, id DESC")
    .all(since);

  return {
    generatedOn: isoDay(0),
    days,
    totals: { orders: Number(totals.orders), revenue: round2(totals.revenue) },
    topProducts: topProducts.map((p) => ({ product: p.product, orders: Number(p.orders), revenue: round2(p.revenue) })),
    ordersPerDay,
    orders: orders.map((o) => ({ ...o, id: Number(o.id) })),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
