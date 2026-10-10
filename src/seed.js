import { openDb } from "./db.js";

const PRODUCTS = ["Espresso Beans 1kg", "Pour-Over Kettle", "Ceramic Mug", "Burr Grinder", "Paper Filters x100", "Travel Press"];
const CUSTOMERS = ["Ayesha", "Bilal", "Chen", "Dana", "Emeka", "Farah", "Goran", "Hana", "Imran", "Jun", "Katya", "Luis"];

// Small seeded PRNG (mulberry32) so a given row count always produces the same dataset.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wipes the table first, so running it twice leaves exactly one clean copy. */
export function seed(db, count = 200) {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const day = 86400000;
  db.exec("BEGIN");
  db.exec("DELETE FROM orders");
  const insert = db.prepare("INSERT INTO orders (customer, product, amount, created_at) VALUES (?, ?, ?, ?)");
  for (let i = 0; i < count; i++) {
    const when = new Date(Date.now() - Math.floor(rand() * 30 * day));
    const amount = Math.round((5 + rand() * 195) * 100) / 100;
    insert.run(pick(CUSTOMERS), pick(PRODUCTS), amount, when.toISOString().slice(0, 10));
  }
  db.exec("COMMIT");
  return db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const count = Number(process.argv[2] ?? 200);
  const db = openDb();
  console.log(`seeded ${seed(db, count)} orders`);
}
