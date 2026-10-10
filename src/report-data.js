import { openDb } from "./db.js";
import { getReportData } from "./queries.js";

// Prints the report object as JSON, without the long detail list. Usage: node src/report-data.js [days]
const days = process.argv[2] ? Number(process.argv[2]) : null;
const { orders, ...summary } = getReportData(openDb(), { days });
console.log(JSON.stringify({ ...summary, detailRows: orders.length }, null, 2));
