import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getReportData } from "./queries.js";
import { buildHtml, renderPdf } from "./render.js";

const link = (id) => `/reports/${id}/file`;
const view = (r) => ({ id: Number(r.id), file: link(r.id), created_at: r.created_at, params: JSON.parse(r.params) });

/**
 * createApp({ db, reportsDir, render }) -> express app. `render(html, path)` is injectable so tests can
 * swap the browser for a fake.
 */
export function createApp({ db, reportsDir = "reports", render = renderPdf }) {
  const dir = resolve(reportsDir);
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // The whole pipeline runs inside the request: query -> render -> store -> link.
  async function generate(params) {
    const day = new Date().toISOString().slice(0, 10);
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `.tmp-${randomUUID()}.pdf`);
    try {
      await render(buildHtml(getReportData(db, params)), tmp);
      const now = new Date().toISOString();
      const { lastInsertRowid: id } = db
        .prepare("INSERT INTO reports (path, created_at, day, params) VALUES ('', ?, ?, ?)")
        .run(now, day, JSON.stringify(params));
      const name = `sales-report-${day}-${id}.pdf`;
      try {
        await rename(tmp, join(dir, name));
      } catch (e) {
        db.prepare("DELETE FROM reports WHERE id = ?").run(id);
        throw e;
      }
      db.prepare("UPDATE reports SET path = ? WHERE id = ?").run(name, id);
      return db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
    } finally {
      await rm(tmp, { force: true });
    }
  }

  app.post("/reports", async (req, res) => {
    const days = req.body?.days;
    if (days !== undefined && !(Number.isInteger(days) && days >= 1 && days <= 365)) {
      return res.status(400).json({ error: "days must be an integer from 1 to 365" });
    }
    try {
      const row = await generate(days ? { days } : {});
      res.status(201).json(view(row));
    } catch (e) {
      console.error("report generation failed:", e);
      res.status(500).json({ error: "could not generate the report" });
    }
  });

  app.get("/reports", (_req, res) => {
    res.json(db.prepare("SELECT * FROM reports ORDER BY id DESC").all().map(view));
  });

  const find = (req) => (/^\d+$/.test(req.params.id) ? db.prepare("SELECT * FROM reports WHERE id = ?").get(Number(req.params.id)) : undefined);

  app.get("/reports/:id", (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: "report not found" });
    res.json(view(row));
  });

  app.get("/reports/:id/file", async (req, res) => {
    const row = find(req);
    if (!row) return res.status(404).json({ error: "report not found" });
    const file = join(dir, row.path);
    try {
      await access(file);
    } catch {
      return res.status(404).json({ error: "report file is missing on disk" });
    }
    res.download(file, row.path, { headers: { "Content-Type": "application/pdf" } });
  });

  return app;
}
