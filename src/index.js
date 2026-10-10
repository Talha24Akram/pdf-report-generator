import { createApp } from "./app.js";
import { openDb } from "./db.js";

const port = Number(process.env.PORT ?? 3000);
createApp({ db: openDb() }).listen(port, () => console.log(`pdf-report-generator on http://localhost:${port}`));
