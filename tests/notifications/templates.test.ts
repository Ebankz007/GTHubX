import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  passwordResetTemplate,
  registrationPaidTemplate,
  verifyEmailTemplate,
} from "@/lib/notifications/templates";

const SITE = "Global Traders HubX";
const VERIFY_URL = "http://localhost:3500/verify-email?token=abc123";
const RESET_URL = "http://localhost:3500/reset-password?token=xyz789";

/** Every template must survive a client that strips markup. */
function expectNoMarkupInText(text: string) {
  expect(text).not.toMatch(/<[a-z/]/i);
  expect(text).not.toContain("&lt;");
}

describe("escapeHtml", () => {
  it("escapes the five characters that matter, ampersand first", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Verify your email")).toBe("Verify your email");
  });
});

describe("verifyEmailTemplate", () => {
  const template = verifyEmailTemplate({
    siteName: SITE,
    name: "Ada Lovelace",
    url: VERIFY_URL,
    ttlHours: 24,
  });

  it("names the site in the subject", () => {
    expect(template.subject).toBe(`Verify your ${SITE} email`);
  });

  it("carries the link in BOTH parts — the URL is the product", () => {
    expect(template.text).toContain(VERIFY_URL);
    expect(template.html).toContain(`href="${VERIFY_URL}"`);
  });

  it("keeps the plain-text part free of markup", () => {
    expectNoMarkupInText(template.text);
  });

  it("states the lifetime it was given, not one it invented", () => {
    expect(template.text).toContain("24 hours");
    expect(template.html).toContain("24 hours");
  });

  it("greets by name when it has one", () => {
    expect(template.text).toContain("Hi Ada Lovelace,");
  });

  it("degrades to a nameless greeting", () => {
    const anonymous = verifyEmailTemplate({ siteName: SITE, url: VERIFY_URL, ttlHours: 24 });
    expect(anonymous.text).toContain("Hi there,");
  });

  it("escapes a hostile display name in the HTML but not in the text", () => {
    const hostile = verifyEmailTemplate({
      siteName: SITE,
      name: "<script>alert(1)</script>",
      url: VERIFY_URL,
      ttlHours: 24,
    });
    expect(hostile.html).not.toContain("<script>");
    expect(hostile.html).toContain("&lt;script&gt;");
    // Plain text is not a markup context; escaping it there would be visible noise.
    expect(hostile.text).toContain("<script>alert(1)</script>");
  });

  it("escapes a hostile site name in the HTML", () => {
    const hostile = verifyEmailTemplate({
      siteName: "<b>X</b>",
      url: VERIFY_URL,
      ttlHours: 24,
    });
    expect(hostile.html).not.toContain("<b>X</b>");
    expect(hostile.html).toContain("&lt;b&gt;X&lt;/b&gt;");
  });
});

describe("passwordResetTemplate", () => {
  const template = passwordResetTemplate({ siteName: SITE, url: RESET_URL, ttlMinutes: 60 });

  it("names the site and the act in the subject", () => {
    expect(template.subject).toBe(`Reset your ${SITE} password`);
  });

  it("carries the link in both parts", () => {
    expect(template.text).toContain(RESET_URL);
    expect(template.html).toContain(`href="${RESET_URL}"`);
  });

  it("reassures that nothing changed if the request was not theirs", () => {
    expect(template.text).toContain("your password has not changed");
    expectNoMarkupInText(template.text);
  });

  it("states the lifetime it was given", () => {
    expect(template.text).toContain("60 minutes");
  });
});

describe("registrationPaidTemplate", () => {
  const template = registrationPaidTemplate({
    siteName: SITE,
    name: "Ada Lovelace",
    amount: "USDT 55.00",
    url: "http://localhost:3500/dashboard/registration",
  });

  it("names the site and the outcome in the subject", () => {
    expect(template.subject).toBe(`Your ${SITE} registration is confirmed`);
  });

  it("tells the member the amount we recorded, in both parts", () => {
    expect(template.text).toContain("USDT 55.00");
    expect(template.html).toContain("USDT 55.00");
  });

  it("links to the registration surface", () => {
    expect(template.text).toContain("/dashboard/registration");
    expect(template.html).toContain('href="http://localhost:3500/dashboard/registration"');
    expectNoMarkupInText(template.text);
  });
});

describe("every template", () => {
  const all = [
    verifyEmailTemplate({ siteName: SITE, url: VERIFY_URL, ttlHours: 24 }),
    passwordResetTemplate({ siteName: SITE, url: RESET_URL, ttlMinutes: 60 }),
    registrationPaidTemplate({ siteName: SITE, amount: "USDT 55.00", url: VERIFY_URL }),
  ];

  it("is a complete HTML document that names the site", () => {
    for (const template of all) {
      expect(template.html).toContain("<!doctype html>");
      expect(template.html).toContain(SITE);
    }
  });

  it("has a non-empty subject, text and html", () => {
    for (const template of all) {
      expect(template.subject.trim().length).toBeGreaterThan(0);
      expect(template.text.trim().length).toBeGreaterThan(0);
      expect(template.html.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses no <div> layout — email clients are not browsers", () => {
    for (const template of all) {
      expect(template.html).not.toContain("<div");
      expect(template.html).toContain('role="presentation"');
    }
  });
});
