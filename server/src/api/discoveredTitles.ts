import { Router } from "express";
import { z } from "zod";
import { db as dbPromise } from "../db/db.js";

/**
 * Review queue for 35mm film the stores sell that the catalogue doesn't track.
 *
 * Titles only. Adding a film means choosing aliases, which is a code change to
 * `catalog/films.ts` reviewed like any other — a film present in the database but not
 * in the seed list would disappear on the next deploy anyway.
 */
export const discoveredTitlesRouter = Router();

type Row = {
  id: number | string;
  title: string;
  store_ids: string[] | string;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
};

const asArray = (v: string[] | string): string[] => {
  if (Array.isArray(v)) return v;
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
};

discoveredTitlesRouter.get("/discovered-titles", async (req, res) => {
  const parsed = z.enum(["new", "added", "ignored", "all"]).safeParse(req.query.status ?? "new");
  if (!parsed.success) return res.status(400).json({ error: "Invalid status" });
  const status = parsed.data;

  const db = await dbPromise;
  const rows = await db.query<Row>(
    status === "all"
      ? `SELECT * FROM discovered_titles ORDER BY last_seen_at DESC, id DESC`
      : `SELECT * FROM discovered_titles WHERE status = $1 ORDER BY last_seen_at DESC, id DESC`,
    status === "all" ? [] : [status]
  );

  return res.json({
    titles: rows.rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      storeIds: asArray(r.store_ids),
      status: r.status,
      firstSeenAt: r.first_seen_at,
      lastSeenAt: r.last_seen_at,
    })),
  });
});

const decisionSchema = z.object({ status: z.enum(["new", "added", "ignored"]) });

discoveredTitlesRouter.post("/discovered-titles/:id", async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "status must be new, added or ignored" });

  const db = await dbPromise;
  const now = db.dialect === "postgres" ? "NOW()" : "datetime('now')";
  await db.query(`UPDATE discovered_titles SET status = $1, reviewed_at = ${now} WHERE id = $2`, [
    parsed.data.status,
    Number(req.params.id),
  ]);

  const rows = await db.query<Row>(`SELECT * FROM discovered_titles WHERE id = $1`, [
    Number(req.params.id),
  ]);
  const row = rows.rows[0];
  if (!row) return res.status(404).json({ error: "No such title" });
  return res.json({ id: Number(row.id), status: row.status });
});
