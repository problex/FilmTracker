import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { filmsRouter } from "./api/films.js";
import { pricesRouter } from "./api/prices.js";
import { adminRouter } from "./api/admin.js";
import { dealsRouter } from "./api/deals.js";
import { storesHealthRouter } from "./api/storesHealth.js";
import { discoveredTitlesRouter } from "./api/discoveredTitles.js";
import { startScrapeScheduler } from "./scrape/schedule.js";
import { buildCorsOptions } from "./corsOrigins.js";
import { assertAdminTokenConfigured, requireAdmin } from "./api/adminAuth.js";
import { authRouter } from "./api/auth.js";
import { followsRouter } from "./api/follows.js";
import { attachUser } from "./auth/session.js";

dotenv.config();

// Before anything binds a port: an unauthenticated admin API on an internet-facing
// host is not something to discover later.
assertAdminTokenConfigured();

const app = express();
app.use(express.json());

app.use(cors(buildCorsOptions()));

// Populates req.user when a session cookie is present. Never rejects — the price
// pages stay public and anonymous.
app.use(attachUser);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/follows", followsRouter);
app.use("/api/films", filmsRouter);
app.use("/api/prices", pricesRouter);
app.use("/api/admin", requireAdmin, adminRouter);
app.use("/api/admin", requireAdmin, discoveredTitlesRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/stores", storesHealthRouter);

const port = Number(process.env.PORT ?? 4000);
const listenHost = process.env.LISTEN_HOST ?? "0.0.0.0";
app.listen(port, listenHost, () => {
  console.log(`API listening on http://${listenHost}:${port}`);
  startScrapeScheduler();
});

