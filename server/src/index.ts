import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { filmsRouter } from "./api/films.js";
import { pricesRouter } from "./api/prices.js";
import { adminRouter } from "./api/admin.js";
import { startScrapeScheduler } from "./scrape/schedule.js";
import { buildCorsOptions } from "./corsOrigins.js";

dotenv.config();

const app = express();
app.use(express.json());

app.use(cors(buildCorsOptions()));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/films", filmsRouter);
app.use("/api/prices", pricesRouter);
app.use("/api/admin", adminRouter);

const port = Number(process.env.PORT ?? 4000);
const listenHost = process.env.LISTEN_HOST ?? "0.0.0.0";
app.listen(port, listenHost, () => {
  console.log(`API listening on http://${listenHost}:${port}`);
  startScrapeScheduler();
});

