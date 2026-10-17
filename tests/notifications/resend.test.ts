import { describe, expect, it, vi } from "vitest";
import {
  RESEND_API_HOST,
  buildResendRequest,
  sendViaResend,
  type OutboundEmail,
  type ResendConfig,
} from "@/lib/notifications/resend";

const CONFIG: ResendConfig = {
  apiKey: "re_test_key",
  from: "Global Traders HubX <no-reply@gthubx.test>",
};

const MESSAGE: OutboundEmail = {
  to: "ada@example.test",
  subject: "Verify your email",
  text: "Click here: https://example.test/verify?token=abc",
  html: "<p>Click here</p>",
};

function bodyOf(request: { init: { body: string } }): Record<string, unknown> {
  return JSON.parse(request.init.body) as Record<string, unknown>;
}

describe("buildResendRequest", () => {
  it("posts to the provider's emails endpoint", () => {
    const request = buildResendRequest(CONFIG, MESSAGE);
    expect(request.url).toBe(`${RESEND_API_HOST}/emails`);
    expect(request.init.method).toBe("POST");
  });

  it("authenticates with the API key as a bearer token", () => {
    const request = buildResendRequest(CONFIG, MESSAGE);
    expect(request.init.headers.Authorization).toBe("Bearer re_test_key");
    expect(request.init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends the message with `to` as an array and the from address verbatim", () => {
    const body = bodyOf(buildResendRequest(CONFIG, MESSAGE));
    expect(body.from).toBe(CONFIG.from);
    expect(body.to).toEqual(["ada@example.test"]);
    expect(body.subject).toBe(MESSAGE.subject);
    expect(body.text).toBe(MESSAGE.text);
    expect(body.html).toBe(MESSAGE.html);
  });

  it("omits `html` entirely when there is none, rather than sending an empty string", () => {
    const body = bodyOf(
      buildResendRequest(CONFIG, { to: "a@b.test", subject: "s", text: "t" }),
    );
    expect("html" in body).toBe(false);
  });

  it("strips a trailing slash from a custom host instead of doubling it", () => {
    const request = buildResendRequest(
      { ...CONFIG, baseUrl: "http://127.0.0.1:9999/" },
      MESSAGE,
    );
    expect(request.url).toBe("http://127.0.0.1:9999/emails");
  });
});

describe("sendViaResend", () => {
  it("reports the provider's message id on success", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await sendViaResend(CONFIG, MESSAGE, fetchImpl);

    expect(result).toEqual({ ok: true, status: 200, id: "msg_123" });
  });

  it("calls fetch with the built request", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }),
    ) as unknown as typeof fetch;

    await sendViaResend(CONFIG, MESSAGE, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, { method: string; body: string }];
    expect(url).toBe(`${RESEND_API_HOST}/emails`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).to).toEqual(["ada@example.test"]);
  });

  it("returns the provider's explanation when it refuses", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("The gthubx.test domain is not verified", { status: 403 }),
    ) as unknown as typeof fetch;

    const result = await sendViaResend(CONFIG, MESSAGE, fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toContain("not verified");
    }
  });

  it("tolerates a success body that is not JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("ok", { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await sendViaResend(CONFIG, MESSAGE, fetchImpl);

    expect(result).toEqual({ ok: true, status: 200, id: null });
  });

  it("turns a transport failure into a result rather than a throw", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.resend.com");
    }) as unknown as typeof fetch;

    const result = await sendViaResend(CONFIG, MESSAGE, fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(0);
      expect(result.error).toContain("ENOTFOUND");
    }
  });

  it("never rejects, whatever the transport does", async () => {
    const fetchImpl = vi.fn(async () => {
      throw "not even an Error";
    }) as unknown as typeof fetch;

    await expect(sendViaResend(CONFIG, MESSAGE, fetchImpl)).resolves.toMatchObject({
      ok: false,
    });
  });
});
