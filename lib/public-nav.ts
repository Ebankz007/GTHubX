/**
 * The public site's navigation — the single source of truth.
 *
 * Why this module exists: navbar and footer each used to hardcode their own
 * link list, while `prisma/seed.ts` maintained a third copy that neither of
 * them read. The three already disagreed with each other, and 15 of the 18
 * links 404'd on a live server. One module, consumed by the navbar, the footer,
 * the seed, and the guard test, makes that class of drift impossible.
 *
 * This is presentation data only — no fetching, no React, safe to import from
 * `prisma/seed.ts`, client components, and Vitest alike.
 */

export type NavGroup = "HEADER" | "COMPANY" | "LEGAL";
export type NavLocation = "HEADER" | "FOOTER";

export type PublicNavItem = {
  /** Stable id — doubles as the `NavigationItem` primary key. */
  id: string;
  label: string;
  /** Leading slash, path only. No trailing slash. */
  href: string;
  /** Which surface(s) show this link. */
  group: NavGroup;
  /** Persisted `NavLocation`, kept explicit so seed ordering never churns. */
  location: NavLocation;
  order: number;
  /**
   * Whether `prisma/seed.ts` provisions a `NavigationItem` row for this link.
   * `/login` and `/register` are auth routes rather than site content, so they
   * are rendered but not provisioned — same as before this module existed.
   */
  provisioned: boolean;
};

export const PUBLIC_NAV: readonly PublicNavItem[] = [
  // Header — also the source of the footer's Platform column (minus Home).
  { id: "nav-header-home", label: "Home", href: "/", group: "HEADER", location: "HEADER", order: 1, provisioned: true },
  { id: "nav-header-copy", label: "Copy Trading", href: "/copy-trading", group: "HEADER", location: "HEADER", order: 2, provisioned: true },
  { id: "nav-header-packages", label: "Packages", href: "/packages", group: "HEADER", location: "HEADER", order: 3, provisioned: true },
  { id: "nav-header-traders", label: "Traders", href: "/traders", group: "HEADER", location: "HEADER", order: 4, provisioned: true },
  { id: "nav-header-community", label: "Community", href: "/community", group: "HEADER", location: "HEADER", order: 5, provisioned: true },
  { id: "nav-header-network", label: "Network", href: "/network", group: "HEADER", location: "HEADER", order: 6, provisioned: true },
  { id: "nav-header-education", label: "Education", href: "/education", group: "HEADER", location: "HEADER", order: 7, provisioned: true },

  // Footer — Company.
  { id: "nav-footer-about", label: "About", href: "/about", group: "COMPANY", location: "FOOTER", order: 1, provisioned: true },
  { id: "nav-footer-contact", label: "Contact", href: "/contact", group: "COMPANY", location: "FOOTER", order: 2, provisioned: true },
  { id: "nav-footer-faq", label: "FAQ", href: "/faq", group: "COMPANY", location: "FOOTER", order: 3, provisioned: true },
  { id: "nav-footer-blog", label: "Blog", href: "/blog", group: "COMPANY", location: "FOOTER", order: 4, provisioned: true },
  { id: "nav-footer-login", label: "Login", href: "/login", group: "COMPANY", location: "FOOTER", order: 5, provisioned: false },
  { id: "nav-footer-register", label: "Join Now", href: "/register", group: "COMPANY", location: "FOOTER", order: 6, provisioned: false },

  // Footer — Legal. All four live under /legal/*.
  // `order` runs 5–8: contiguous with the Company rows above. Login/Register
  // also use 5–6 but are not provisioned, so no two DB rows ever share a slot.
  { id: "nav-footer-risk", label: "Risk Disclosure", href: "/legal/risk-disclosure", group: "LEGAL", location: "FOOTER", order: 5, provisioned: true },
  { id: "nav-footer-terms", label: "Terms of Service", href: "/legal/terms", group: "LEGAL", location: "FOOTER", order: 6, provisioned: true },
  { id: "nav-footer-privacy", label: "Privacy Policy", href: "/legal/privacy", group: "LEGAL", location: "FOOTER", order: 7, provisioned: true },
  { id: "nav-footer-cookies", label: "Cookie Policy", href: "/legal/cookies", group: "LEGAL", location: "FOOTER", order: 8, provisioned: true },
];

/** Rows `prisma/seed.ts` writes to the `NavigationItem` table. */
export const PROVISIONABLE_NAV = PUBLIC_NAV.filter((item) => item.provisioned);

/** Header bar. Home lives on the logo, so it is not repeated as a link. */
export const HEADER_LINKS = PUBLIC_NAV.filter(
  (item) => item.group === "HEADER" && item.href !== "/",
);

/** Footer — Platform column: the header's destinations, minus Home. */
export const FOOTER_PLATFORM = PUBLIC_NAV.filter(
  (item) => item.group === "HEADER" && item.href !== "/",
);

export const FOOTER_COMPANY = PUBLIC_NAV.filter(
  (item) => item.group === "COMPANY",
);

export const FOOTER_LEGAL = PUBLIC_NAV.filter((item) => item.group === "LEGAL");

/** Every href the site advertises anywhere. The guard test walks this. */
export const ALL_PUBLIC_HREFS = PUBLIC_NAV.map((item) => item.href);
