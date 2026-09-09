/**
 * Decides whether a price change is worth an email.
 *
 * Kept pure and separate from the database because the failure mode here is silent
 * and expensive in both directions: too eager and the alert becomes something people
 * filter to a folder within a week, too shy and the feature does nothing at all. This
 * is the part worth testing.
 *
 * The scrape runs twice a day, so "alert on any drop" would mail constantly. Two
 * rules instead, and each carries its own re-arm condition so a film that simply sits
 * cheap is announced once, not sixty times.
 */

export type AlertInputs = {
  /** Best current price per comparable unit; null when nothing is in stock. */
  currentCents: number | null;
  /** The same figure at the previous scrape, or null the first time we see a film. */
  previousCents: number | null;
  /** What the follower asked to be told about, if they named a number. */
  targetCents: number | null;
  /** What we last emailed this follower about this film. */
  lastAlertedCents: number | null;
  /** Percentage fall that counts as a drop when no target is set. */
  dropPercent: number;
};

export type AlertDecision = {
  alert: boolean;
  /**
   * The `lastAlertedCents` to persist. Returned rather than inferred by the caller
   * because re-arming is part of the same decision: once a price climbs back out of
   * range, forgetting the old figure is what allows the next fall to be announced.
   */
  lastAlertedCents: number | null;
};

export function evaluateAlert(inputs: AlertInputs): AlertDecision {
  const { currentCents, previousCents, targetCents, lastAlertedCents, dropPercent } = inputs;

  // Out of stock everywhere. Hold the existing state: a film that vanishes for a day
  // and returns at the same price has not become news.
  if (currentCents == null) {
    return { alert: false, lastAlertedCents };
  }

  if (targetCents != null) {
    // Above the asking price — nothing to say, and the next time it falls under is
    // worth hearing about again.
    if (currentCents > targetCents) {
      return { alert: false, lastAlertedCents: null };
    }
    // Under target, but not better than what they were already told.
    if (lastAlertedCents != null && currentCents >= lastAlertedCents) {
      return { alert: false, lastAlertedCents };
    }
    return { alert: true, lastAlertedCents: currentCents };
  }

  // No target: fall back to a percentage drop against the previous run.
  if (previousCents == null || previousCents <= 0) {
    // First sighting. There is no baseline, and treating one as a 100% drop would
    // mail the entire catalogue the first time this runs.
    return { alert: false, lastAlertedCents };
  }

  const threshold = Math.floor((previousCents * (100 - dropPercent)) / 100);

  if (currentCents > threshold) {
    // Not a real drop. If the price has recovered to its old level, forget what we
    // last said so the next genuine fall is reported.
    return {
      alert: false,
      lastAlertedCents: currentCents >= previousCents ? null : lastAlertedCents,
    };
  }

  if (lastAlertedCents != null && currentCents >= lastAlertedCents) {
    return { alert: false, lastAlertedCents };
  }

  return { alert: true, lastAlertedCents: currentCents };
}

/** Percentage fall, for the email body. */
export function dropPercentBetween(previousCents: number, currentCents: number) {
  if (previousCents <= 0) return 0;
  return Math.round(((previousCents - currentCents) / previousCents) * 100);
}
