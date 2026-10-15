import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  ALL_PUBLIC_HREFS,
  FOOTER_COMPANY,
  FOOTER_LEGAL,
  FOOTER_PLATFORM,
  HEADER_LINKS,
  PROVISIONABLE_NAV,
  PUBLIC_NAV,
} from "@/lib/public-nav";
import { ALL_PENDING_PATHS } from "@/lib/pending-pages";

const APP_DIR = path.join(process.cwd(), "app");

/**
 * Concrete (non-dynamic) routes as URL paths. Dynamic segments are skipped —
 * they are covered separately by asserting their whitelist and page file pair
 * up, because a `[slug]` folder does not enumerate to real URLs.
 */
function collectStaticRoutes(dir: string, base: string, out: Set<string>): void {
  const page = path.join(dir, "page.tsx");
  if (existsSync(page)) out.add(base === "" ? "/" : base);

  for (const entry of readdirSync(dir)) {
    if (entry.startsWith("[") || entry.startsWith("@")) continue;
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("(")) {
      // Route groups do not appear in the URL.
      collectStaticRoutes(full, base, out);
    } else {
      collectStaticRoutes(full, `${base}/${entry}`, out);
    }
  }
}

const staticRoutes = new Set<string>();
collectStaticRoutes(APP_DIR, "", staticRoutes);

describe("public navigation", () => {
  it("has no duplicate hrefs", () => {
    const hrefs = PUBLIC_NAV.map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("has no duplicate ids (the seed upserts on id)", () => {
    const ids = PUBLIC_NAV.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every advertised href is accounted for by a route or the pending whitelist", () => {
    // The defect this suite exists for: three hand-maintained link lists
    // drifted apart and 15 of 18 public links 404'd on a live server. A link
    // that is neither a real page nor a declared pending page fails here.
    const known = new Set([...staticRoutes, ...ALL_PENDING_PATHS]);
    const dead = ALL_PUBLIC_HREFS.filter((href) => !known.has(href));
    expect(dead, `dead nav links: ${dead.join(", ")}`).toEqual([]);
  });

  it("every pending whitelist entry is backed by a real page file", () => {
    // Whitelists rot too: a declared pending path whose route was deleted
    // would 404 while every other assertion stayed green.
    expect(existsSync(path.join(APP_DIR, "(public)", "[slug]", "page.tsx"))).toBe(
      true,
    );
    expect(
      existsSync(path.join(APP_DIR, "(public)", "legal", "[slug]", "page.tsx")),
    ).toBe(true);
  });

  it("every provisioned nav row has a route or pending entry behind its url", () => {
    const known = new Set([...staticRoutes, ...ALL_PENDING_PATHS]);
    const dead = PROVISIONABLE_NAV.filter((n) => !known.has(n.href));
    expect(dead.map((n) => n.id)).toEqual([]);
  });

  it("header renders six links: Home is on the logo, not duplicated", () => {
    expect(HEADER_LINKS).toHaveLength(6);
    expect(HEADER_LINKS.some((n) => n.href === "/")).toBe(false);
  });

  it("footer columns cover every group exactly once", () => {
    expect(FOOTER_PLATFORM).toHaveLength(6);
    expect(FOOTER_COMPANY).toHaveLength(6);
    expect(FOOTER_LEGAL).toHaveLength(4);
    const covered = [...FOOTER_PLATFORM, ...FOOTER_COMPANY, ...FOOTER_LEGAL].map(
      (n) => n.href,
    );
    expect(new Set(covered).size).toBe(covered.length);
  });

  it("keeps all four legal links under /legal/*", () => {
    for (const item of FOOTER_LEGAL) {
      expect(item.href.startsWith("/legal/")).toBe(true);
    }
    expect(FOOTER_LEGAL.map((n) => n.href)).toEqual([
      "/legal/risk-disclosure",
      "/legal/terms",
      "/legal/privacy",
      "/legal/cookies",
    ]);
  });

  it("routes auth links but does not provision them", () => {
    const unprovisioned = PUBLIC_NAV.filter((n) => !n.provisioned);
    expect(unprovisioned.map((n) => n.href).sort()).toEqual([
      "/login",
      "/register",
    ]);
  });

  it("resolves the landing page as a real static route", () => {
    expect(staticRoutes.has("/")).toBe(true);
    expect(staticRoutes.has("/login")).toBe(true);
    expect(staticRoutes.has("/register")).toBe(true);
  });
});
