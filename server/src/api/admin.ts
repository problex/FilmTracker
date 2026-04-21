import { Router } from "express";
import { runScrape } from "../scrape/run.js";

export const adminRouter = Router();

adminRouter.post("/scrape", async (_req, res) => {
  try {
    const summary = await runScrape();
    const ok = summary.stores.every((s) => s.errors.length === 0);
    return res.status(ok ? 200 : 207).json({ ok, summary });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Scrape failed" });
  }
});

