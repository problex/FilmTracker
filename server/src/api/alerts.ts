import { Router } from "express";
import { db as dbPromise } from "../db/db.js";
import { verifyUnsubscribe } from "../alerts/run.js";

export const alertsRouter = Router();

/**
 * One-click unsubscribe from an email.
 *
 * Deliberately a GET with no confirmation step: someone who wants out of a mailing
 * list should not have to sign in to escape it, and a mail client that prefetches the
 * link doing the unsubscribe is a far smaller harm than an alert someone cannot stop.
 *
 * Authenticated by an HMAC of the user id, so the link cannot be guessed or walked to
 * another account by changing the id.
 */
alertsRouter.get("/unsubscribe", async (req, res) => {
  const userId = typeof req.query.u === "string" ? req.query.u : null;
  const signature = typeof req.query.t === "string" ? req.query.t : null;

  if (!userId || !signature || !verifyUnsubscribe(userId, signature)) {
    return res.status(400).send("That unsubscribe link isn't valid.");
  }

  const db = await dbPromise;
  await db.query(`DELETE FROM film_follows WHERE user_id = $1`, [userId]);

  return res
    .status(200)
    .send(
      "You're unsubscribed — every film has been unfollowed and no more price alerts " +
        "will be sent. You can follow films again any time by signing in."
    );
});
