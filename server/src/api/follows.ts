import { Router } from "express";
import { z } from "zod";
import { db as dbPromise } from "../db/db.js";
import { requireUser, type AuthedRequest } from "../auth/session.js";

export const followsRouter = Router();

const upsertSchema = z.object({
  filmId: z.string().min(1).max(120),
  /**
   * Dollars from the client, cents in the database — the rest of the schema is in
   * cents, and a float target price would drift against integer prices.
   * `null` means "no target": alert me on a meaningful drop instead.
   */
  targetPriceCad: z.number().positive().max(10_000).nullable().optional(),
});

followsRouter.use(requireUser);

followsRouter.get("/", async (req: AuthedRequest, res) => {
  const db = await dbPromise;
  const result = await db.query<{ film_id: string; target_price_cad_cents: number | null }>(
    `SELECT film_id, target_price_cad_cents
       FROM film_follows
      WHERE user_id = $1
      ORDER BY film_id`,
    [req.user!.id]
  );

  return res.json({
    follows: result.rows.map((r) => ({
      filmId: r.film_id,
      targetPriceCadCents: r.target_price_cad_cents,
    })),
  });
});

followsRouter.put("/", async (req: AuthedRequest, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

  const { filmId } = parsed.data;
  const targetCents =
    parsed.data.targetPriceCad == null ? null : Math.round(parsed.data.targetPriceCad * 100);

  const db = await dbPromise;

  // Reject unknown films rather than storing a dangling follow that can never fire.
  const film = await db.query<{ id: string }>(`SELECT id FROM films WHERE id = $1`, [filmId]);
  if (!film.rows[0]) return res.status(404).json({ error: "No such film" });

  await db.query(
    `INSERT INTO film_follows (user_id, film_id, target_price_cad_cents)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, film_id) DO UPDATE SET
       target_price_cad_cents = EXCLUDED.target_price_cad_cents`,
    [req.user!.id, filmId, targetCents]
  );

  return res.json({ ok: true, filmId, targetPriceCadCents: targetCents });
});

followsRouter.delete("/:filmId", async (req: AuthedRequest, res) => {
  const db = await dbPromise;
  await db.query(`DELETE FROM film_follows WHERE user_id = $1 AND film_id = $2`, [
    req.user!.id,
    req.params.filmId,
  ]);
  return res.json({ ok: true });
});
