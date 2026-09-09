import { describe, expect, it } from "vitest";
import { GraphMailer, type GraphConfig } from "./graphMailer.js";

const config: GraphConfig = {
  tenantId: "tenant-1",
  clientId: "client-1",
  clientSecret: "shh",
  sender: "filmtracker@problex.com",
};

const email = { to: "friend@example.com", subject: "Portra dropped", text: "$17.50 at Aden" };

type Call = { url: string; init: RequestInit };

/**
 * A fetch stub that records calls and answers by URL. Graph is two endpoints — a token
 * from login.microsoftonline.com and a send to graph.microsoft.com — so the responses
 * are keyed on which one was hit.
 */
function stub(opts: {
  tokenStatus?: number;
  sendStatuses?: number[];
  expiresIn?: number;
}) {
  const calls: Call[] = [];
  const sendStatuses = [...(opts.sendStatuses ?? [202])];

  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, init: init ?? {} });

    if (href.includes("login.microsoftonline.com")) {
      const status = opts.tokenStatus ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({ access_token: `token-${calls.length}`, expires_in: opts.expiresIn ?? 3600 }),
        text: async () => "token error body",
      } as unknown as Response;
    }

    const status = sendStatuses.shift() ?? 202;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({}),
      text: async () => "send error body",
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

const tokenCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("login.microsoftonline.com"));
const sendCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("graph.microsoft.com"));

describe("GraphMailer", () => {
  it("sends as the configured mailbox, and does not fill its Sent Items", async () => {
    const { calls, fetchImpl } = stub({});
    await new GraphMailer(config, fetchImpl).send(email);

    const send = sendCalls(calls)[0]!;
    expect(send.url).toBe(
      "https://graph.microsoft.com/v1.0/users/filmtracker%40problex.com/sendMail"
    );

    const body = JSON.parse(String(send.init.body));
    expect(body.message.subject).toBe("Portra dropped");
    expect(body.message.toRecipients[0].emailAddress.address).toBe("friend@example.com");
    expect(body.message.body.contentType).toBe("Text");
    // Every alert otherwise accumulates in the mailbox forever.
    expect(body.saveToSentItems).toBe(false);
  });

  /** Tokens last an hour; fetching one per email triples the requests and invites throttling. */
  it("reuses a token across sends", async () => {
    const { calls, fetchImpl } = stub({});
    const mailer = new GraphMailer(config, fetchImpl);

    await mailer.send(email);
    await mailer.send(email);
    await mailer.send(email);

    expect(tokenCalls(calls)).toHaveLength(1);
    expect(sendCalls(calls)).toHaveLength(3);
  });

  it("does not reuse a token that is about to expire", async () => {
    // 30s of life left, inside the safety margin.
    const { calls, fetchImpl } = stub({ expiresIn: 30 });
    const mailer = new GraphMailer(config, fetchImpl);

    await mailer.send(email);
    await mailer.send(email);

    expect(tokenCalls(calls)).toHaveLength(2);
  });

  /** A cached token can be revoked before it expires — a rotated secret, consent withdrawn. */
  it("refreshes once and retries when Graph rejects the cached token", async () => {
    const { calls, fetchImpl } = stub({ sendStatuses: [401, 202] });
    await new GraphMailer(config, fetchImpl).send(email);

    expect(tokenCalls(calls)).toHaveLength(2);
    expect(sendCalls(calls)).toHaveLength(2);
  });

  it("gives up rather than looping when the retry also fails", async () => {
    const { calls, fetchImpl } = stub({ sendStatuses: [401, 401] });
    await expect(new GraphMailer(config, fetchImpl).send(email)).rejects.toThrow(/401/);
    expect(sendCalls(calls)).toHaveLength(2);
  });

  it("surfaces the response body, which is where Entra explains refusals", async () => {
    const { fetchImpl } = stub({ tokenStatus: 400 });
    await expect(new GraphMailer(config, fetchImpl).send(email)).rejects.toThrow(
      /token request failed: 400 token error body/
    );

    const send = stub({ sendStatuses: [403] });
    await expect(new GraphMailer(config, send.fetchImpl).send(email)).rejects.toThrow(
      /sendMail failed: 403 send error body/
    );
  });
});
