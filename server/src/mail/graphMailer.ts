import type { Email, Mailer } from "./mailer.js";

/**
 * Sends through Microsoft Graph as a mailbox in the tenant that already handles this
 * domain's email.
 *
 * Chosen over a third-party sender because it needs no DNS at all: mail leaves through
 * Exchange Online, which problex.com's SPF already authorises and which M365 signs with
 * its own DKIM. Adding a separate sending service would have meant editing a live SPF
 * record ending in `-all`, where a mistake takes down business email.
 *
 * App-only (client credentials), because there is no signed-in user on a NAS at
 * midnight. Note what that grant means: the `Mail.Send` *application* permission lets
 * an app send as any mailbox in the tenant, so the app registration must be restricted
 * to this one mailbox with an Exchange application access policy (or RBAC for
 * Applications). See DEPLOY.md — that restriction is part of the setup, not an extra.
 */

type TokenResponse = { access_token: string; expires_in: number };

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Mailbox to send as, e.g. filmtracker@problex.com. */
  sender: string;
};

export class GraphMailer implements Mailer {
  readonly name = "microsoft-graph";

  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: GraphConfig,
    /** Injected so the token cache and payload shape can be tested without network. */
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async accessToken(): Promise<string> {
    // Tokens last an hour. Re-fetching per email would triple the request count and
    // invite throttling, so it is cached with a minute of headroom.
    if (this.token && this.token.expiresAt > Date.now() + 60_000) {
      return this.token.value;
    }

    const url = `https://login.microsoftonline.com/${encodeURIComponent(
      this.config.tenantId
    )}/oauth2/v2.0/token`;

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Entra explains refusals here — expired secret, missing consent, wrong tenant —
      // and without the body a failure is an opaque 400.
      throw new Error(`Graph token request failed: ${res.status} ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as TokenResponse;
    if (!json.access_token) throw new Error("Graph token response had no access_token");

    this.token = {
      value: json.access_token,
      expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    };
    return this.token.value;
  }

  async send(email: Email): Promise<void> {
    await this.sendOnce(email, await this.accessToken(), true);
  }

  private async sendOnce(email: Email, token: string, mayRetry: boolean): Promise<void> {
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
      this.config.sender
    )}/sendMail`;

    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: email.subject,
          body: email.html
            ? { contentType: "HTML", content: email.html }
            : { contentType: "Text", content: email.text },
          toRecipients: [{ emailAddress: { address: email.to } }],
        },
        // Otherwise every price alert lands in the mailbox's Sent Items forever.
        saveToSentItems: false,
      }),
    });

    if (res.status === 401 && mayRetry) {
      // A cached token can be revoked before it expires — a rotated secret, or consent
      // withdrawn. Drop it and try once with a fresh one rather than failing the run.
      this.token = null;
      return this.sendOnce(email, await this.accessToken(), false);
    }

    // Graph answers 202 Accepted; it does not return a body on success.
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Graph sendMail failed: ${res.status} ${body.slice(0, 300)}`);
    }
  }
}

export function graphConfigFromEnv(): GraphConfig | null {
  const tenantId = process.env.GRAPH_TENANT_ID?.trim();
  const clientId = process.env.GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.GRAPH_CLIENT_SECRET?.trim();
  const sender = process.env.GRAPH_SENDER?.trim();

  if (!tenantId || !clientId || !clientSecret || !sender) {
    // Warn only when it looks half-configured; silence when Graph simply is not in use.
    if (tenantId || clientId || clientSecret || sender) {
      console.warn(
        "Microsoft Graph mail is partly configured (need GRAPH_TENANT_ID, GRAPH_CLIENT_ID, " +
          "GRAPH_CLIENT_SECRET and GRAPH_SENDER); falling back to another transport"
      );
    }
    return null;
  }

  return { tenantId, clientId, clientSecret, sender };
}
