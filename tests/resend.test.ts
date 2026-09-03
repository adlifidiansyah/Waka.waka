import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { buildPayload, isEmailConfigured, sendEmail } from "../src/lib/email/resend.ts";

const INPUT = {
  to: "maya@auroracoffee.test",
  subject: "Your portal",
  html: "<p>hi</p>",
  text: "hi",
};

describe("Resend request payload", () => {
  test("sends the shape Resend documents", () => {
    const payload = buildPayload("Studio <portal@studio.test>", INPUT);
    assert.deepEqual(payload, {
      from: "Studio <portal@studio.test>",
      to: ["maya@auroracoffee.test"],
      subject: "Your portal",
      html: "<p>hi</p>",
      text: "hi",
    });
  });

  test("reply_to is included only when set, so replies reach the freelancer", () => {
    const withReply = buildPayload("f@s.test", { ...INPUT, replyTo: "alice@studio.test" });
    assert.deepEqual(withReply.reply_to, ["alice@studio.test"]);
    assert.ok(!("reply_to" in buildPayload("f@s.test", { ...INPUT, replyTo: null })));
  });

  test("always sends a plain-text alternative alongside the HTML", () => {
    const payload = buildPayload("f@s.test", INPUT);
    assert.equal(typeof payload.text, "string");
    assert.ok(payload.text.length > 0);
  });
});

describe("configuration", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  test("reports unconfigured until both variables are set", () => {
    assert.equal(isEmailConfigured(), false);
    process.env.RESEND_API_KEY = "re_test";
    assert.equal(isEmailConfigured(), false);
    process.env.RESEND_FROM_EMAIL = "Studio <portal@studio.test>";
    assert.equal(isEmailConfigured(), true);
  });

  test("sending without configuration fails softly, never throws", async () => {
    const result = await sendEmail(INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "not_configured");
  });
});

describe("sending against a stub provider", () => {
  let server: http.Server;
  let received: { headers: http.IncomingHttpHeaders; body: string } | null = null;
  let respond: (res: http.ServerResponse) => void;

  before(async () => {
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      received = { headers: req.headers, body: Buffer.concat(chunks).toString() };
      respond(res);
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    // The transport posts to a fixed endpoint, so redirect it at the stub.
    process.env.RESEND_ENDPOINT_OVERRIDE = `http://127.0.0.1:${port}/emails`;
  });

  after(() => server.close());

  beforeEach(() => {
    received = null;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "Studio <portal@studio.test>";
  });

  test("a 200 returns the provider message id", async () => {
    respond = (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_123" }));
    };
    const result = await sendEmail(INPUT);
    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.id, "msg_123");
  });

  test("authorises with the API key and forwards the idempotency key", async () => {
    respond = (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_456" }));
    };
    await sendEmail({ ...INPUT, idempotencyKey: "portal-link-abc" });
    assert.equal(received?.headers.authorization, "Bearer re_test_key");
    assert.equal(received?.headers["idempotency-key"], "portal-link-abc");
    assert.deepEqual(JSON.parse(received!.body).to, ["maya@auroracoffee.test"]);
  });

  test("a provider rejection surfaces the provider's own reason", async () => {
    respond = (res) => {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "The studio.test domain is not verified." }));
    };
    const result = await sendEmail(INPUT);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "rejected");
    assert.match(result.ok === false ? result.message : "", /not verified/);
  });

  test("a 4xx is permanent — retrying an unverified domain only burns the budget", async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      respond = (res) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "nope" }));
      };
      const result = await sendEmail(INPUT);
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.retryable, false, `${status} should not retry`);
      assert.equal(result.ok === false && result.reason, "rejected");
    }
  });

  test("a 429 or 5xx is retryable — the provider is briefly unable, not refusing", async () => {
    for (const status of [408, 429, 500, 502, 503]) {
      respond = (res) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({}));
      };
      const result = await sendEmail(INPUT);
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.retryable, true, `${status} should retry`);
      assert.equal(result.ok === false && result.reason, "unavailable");
    }
  });

  test("an unreachable provider is retryable", async () => {
    const previous = process.env.RESEND_ENDPOINT_OVERRIDE;
    process.env.RESEND_ENDPOINT_OVERRIDE = "http://127.0.0.1:1/emails";
    const result = await sendEmail(INPUT);
    if (previous) process.env.RESEND_ENDPOINT_OVERRIDE = previous;
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.retryable, true);
    assert.equal(result.ok === false && result.reason, "network");
  });

  test("a missing configuration is not retryable", async () => {
    const key = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail(INPUT);
    if (key) process.env.RESEND_API_KEY = key;
    assert.equal(result.ok === false && result.retryable, false);
  });

  test("a rejection with no body still returns a usable message", async () => {
    respond = (res) => {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("upstream exploded");
    };
    const result = await sendEmail(INPUT);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.message : "", /HTTP 500/);
  });
});
