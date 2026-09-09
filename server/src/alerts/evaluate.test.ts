import { describe, expect, it } from "vitest";
import { evaluateAlert, dropPercentBetween, type AlertInputs } from "./evaluate.js";

/**
 * The scrape runs twice a day against 121 films. Every case here is a way this
 * silently becomes either a mailing list nobody reads or a feature that never fires.
 */

const base: AlertInputs = {
  currentCents: 2000,
  previousCents: 2000,
  targetCents: null,
  lastAlertedCents: null,
  dropPercent: 10,
};

const at = (o: Partial<AlertInputs>) => evaluateAlert({ ...base, ...o });

describe("target price", () => {
  it("fires when the price reaches the asking price", () => {
    expect(at({ targetCents: 1800, currentCents: 1800 }).alert).toBe(true);
    expect(at({ targetCents: 1800, currentCents: 1750 }).alert).toBe(true);
  });

  it("stays quiet above it", () => {
    expect(at({ targetCents: 1800, currentCents: 1801 }).alert).toBe(false);
  });

  /** The one that decides whether this feature is usable: twice a day, forever. */
  it("does not repeat while the price sits at the target", () => {
    const first = at({ targetCents: 1800, currentCents: 1800 });
    expect(first.alert).toBe(true);
    expect(first.lastAlertedCents).toBe(1800);

    const second = at({
      targetCents: 1800,
      currentCents: 1800,
      lastAlertedCents: first.lastAlertedCents,
    });
    expect(second.alert, "a price that has not moved is not news").toBe(false);
  });

  it("fires again when it falls further still", () => {
    expect(at({ targetCents: 1800, currentCents: 1600, lastAlertedCents: 1800 }).alert).toBe(true);
  });

  it("re-arms once the price climbs back above the target", () => {
    const recovered = at({ targetCents: 1800, currentCents: 2200, lastAlertedCents: 1800 });
    expect(recovered.alert).toBe(false);
    expect(recovered.lastAlertedCents, "forgetting is what allows the next fall").toBe(null);

    expect(
      at({ targetCents: 1800, currentCents: 1800, lastAlertedCents: recovered.lastAlertedCents })
        .alert
    ).toBe(true);
  });
});

describe("percentage drop", () => {
  it("fires on a fall of at least the threshold", () => {
    expect(at({ previousCents: 2000, currentCents: 1800 }).alert).toBe(true);
  });

  it("ignores ordinary wobble", () => {
    expect(at({ previousCents: 2000, currentCents: 1900 }).alert).toBe(false);
    expect(at({ previousCents: 2000, currentCents: 2100 }).alert).toBe(false);
  });

  /**
   * Without this, the first run after deploying mails every follower about every film
   * they follow, because a missing baseline reads as a fall from infinity.
   */
  it("never fires on the first sighting of a film", () => {
    expect(at({ previousCents: null, currentCents: 100 }).alert).toBe(false);
  });

  it("does not repeat at the same or a higher price", () => {
    expect(at({ previousCents: 2000, currentCents: 1800, lastAlertedCents: 1800 }).alert).toBe(false);
    expect(at({ previousCents: 2000, currentCents: 1850, lastAlertedCents: 1800 }).alert).toBe(false);
  });

  it("re-arms after the price returns to its old level", () => {
    const recovered = at({ previousCents: 2000, currentCents: 2000, lastAlertedCents: 1800 });
    expect(recovered.lastAlertedCents).toBe(null);
  });
});

describe("out of stock", () => {
  /** A film nobody stocks has not dropped to zero. */
  it("says nothing and keeps its state", () => {
    const d = at({ currentCents: null, lastAlertedCents: 1800 });
    expect(d.alert).toBe(false);
    expect(d.lastAlertedCents).toBe(1800);
  });
});

describe("dropPercentBetween", () => {
  it("reports the fall for the email body", () => {
    expect(dropPercentBetween(2000, 1800)).toBe(10);
    expect(dropPercentBetween(3199, 2399)).toBe(25);
    expect(dropPercentBetween(0, 100)).toBe(0);
  });
});
