/**
 * Outbound email.
 *
 * An HTTP API rather than SMTP: the NAS sits on a residential IP, where direct SMTP is
 * either blocked outright or filtered as spam, and where reputation is not something a
 * home connection can build. Every transport here is a plain `fetch`, so none of this
 * needs a dependency — Node 22 has global `fetch`.
 *
 * Transport is chosen by what is configured, in order:
 *
 *  1. **Microsoft Graph**, when the tenant is configured. Preferred: mail leaves
 *     through the Exchange Online tenant that already handles this domain, so SPF and
 *     DKIM are already correct and no DNS changes are needed.
 *  2. **Resend**, when an API key is set instead.
 *  3. **Console**, otherwise.
 *
 * The console default is deliberate: with nothing configured, dev and the test suite
 * print emails rather than sending them, and cannot mail a real person by accident.
 * The addresses in this table belong to actual friends.
 */

import { GraphMailer, graphConfigFromEnv } from "./graphMailer.js";

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface Mailer {
  send(email: Email): Promise<void>;
  /** Named for logs and tests, so a run can say which transport it used. */
  readonly name: string;
}

export class ConsoleMailer implements Mailer {
  readonly name = "console";
  readonly sent: Email[] = [];

  async send(email: Email): Promise<void> {
    this.sent.push(email);
    console.log(
      [
        "",
        "──────── email (console transport) ────────",
        `to:      ${email.to}`,
        `subject: ${email.subject}`,
        "",
        email.text,
        "───────────────────────────────────────────",
        "",
      ].join("\n")
    );
  }
}

export class ResendMailer implements Mailer {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(email: Email): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.html ? { html: email.html } : {}),
      }),
    });

    if (!res.ok) {
      // Include the body: Resend explains refusals (unverified domain, invalid
      // recipient) in it, and without that a failure is just a status code.
      const body = await res.text().catch(() => "");
      throw new Error(`Resend refused the message: ${res.status} ${body.slice(0, 300)}`);
    }
  }
}

let cached: Mailer | null = null;

export function createMailer(): Mailer {
  if (cached) return cached;

  const graph = graphConfigFromEnv();
  if (graph) {
    cached = new GraphMailer(graph);
    console.log(`Mailer: ${cached.name} (as ${graph.sender})`);
    return cached;
  }

  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ALERT_FROM_EMAIL?.trim();

  if (key && from) {
    cached = new ResendMailer(key, from);
  } else {
    if (key && !from) {
      console.warn("RESEND_API_KEY is set but ALERT_FROM_EMAIL is not; using the console transport");
    }
    cached = new ConsoleMailer();
  }

  console.log(`Mailer: ${cached.name}`);
  return cached;
}

/** Tests and scripts inject their own transport. */
export function setMailer(m: Mailer | null) {
  cached = m;
}
