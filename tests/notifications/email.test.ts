import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailConfigured, resolveEmailConfig, sendEmail } from "@/lib/notifications/email";

const MESSAGE = {
  to: "ada@example.test",
  subject: "Verify your email",
  text: "Click here: https://example.test/verify?token=abc",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveEmailConfig", () => {
  it("is unconfigured with no key and no sender", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    expect(resolveEmailConfig()).toBeNull();
    expect(isEmailConfigured()).toBe(false);
  });

  it("is unconfigured with a key but no verified sender", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "");
    expect(resolveEmailConfig()).toBeNull();
  });

  it("is unconfigured with a sender but no key", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "GTHubX <no-reply@gthubx.test>");
    expect(resolveEmailConfig()).toBeNull();
  });

  it("is configured only when both are present, and trims them", () => {
    vi.stubEnv("RESEND_API_KEY", "  re_test_key  ");
    vi.stubEnv("EMAIL_FROM", "  GTHubX <no-reply@gthubx.test>  ");
    expect(resolveEmailConfig()).toEqual({
      apiKey: "re_test_key",
      from: "GTHubX <no-reply@gthubx.test>",
    });
  });
});

describe("sendEmail without a provider", () => {
  it("reports failure in production rather than pretending to have sent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("NODE_ENV", "production");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ delivered: false, reason: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("logs the message in development so the flow stays usable", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ delivered: false, reason: "dev_logged" });
    expect(info).toHaveBeenCalledOnce();
    // The link has to reach the log, or a developer cannot finish the flow.
    expect(String(info.mock.calls[0][0])).toContain("token=abc");
    info.mockRestore();
  });
});

describe("sendEmail with a provider", () => {
  function configure() {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "GTHubX <no-reply@gthubx.test>");
  }

  it("reports delivered with the provider's id", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 })),
    );

    expect(await sendEmail(MESSAGE)).toEqual({ delivered: true, id: "msg_1" });
  });

  it("reports the refusal with its status instead of throwing", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("sender not verified", { status: 403 })),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendEmail(MESSAGE);

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("resend_403");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("survives a provider that cannot be reached at all", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ delivered: false, reason: "resend_unreachable" });
    warn.mockRestore();
  });
});
