import { openDb } from "./db.js";
import { getReportData } from "./queries.js";
import { buildHtml, renderPdf } from "./render.js";

// Stage 3 bench script: renders reports/test.pdf straight from the database (no server).
await renderPdf(buildHtml(getReportData(openDb())), "reports/test.pdf");
console.log("wrote reports/test.pdf");
