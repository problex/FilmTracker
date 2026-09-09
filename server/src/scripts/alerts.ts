/**
 * Run the alert pass by hand, without waiting for a scrape.
 *
 * Useful for checking a change against real data: with no RESEND_API_KEY set it
 * prints the emails it would send instead of sending them.
 */
import { runAlerts } from "../alerts/run.js";

const summary = await runAlerts();
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
