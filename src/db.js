import { DatabaseSync } from "node:sqlite";

export const DB_PATH = process.env.DB_PATH ?? "report.db";

export function openDb(path = DB_PATH) {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      customer TEXT NOT NULL,
      product TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

    -- report bookkeeping lives next to the data: the PDF itself stays on disk, only its path is stored
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      day TEXT NOT NULL,       -- UTC date the report was generated (for the once-per-day rule)
      params TEXT NOT NULL     -- JSON of the options used, e.g. {"days":7}
    );
  `);
  return db;
}
