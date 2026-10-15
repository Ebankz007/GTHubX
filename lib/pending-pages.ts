/**
 * Whitelist of public routes that exist but have no published content yet.
 *
 * A route that is *missing* should still 404 — that signal is how dead links
 * get caught. A route that *exists* but is unpublished says so plainly instead
 * of pretending to be broken or, worse, inventing copy we have not been given.
 *
 * Keys are path segments: `"packages"` serves `/packages`. The `/legal/*`
 * namespace has its own map so nothing can land there by accident.
 *
 * When Henry supplies copy for one of these, move it out of this map and into
 * a real page — nothing else changes.
 */

export type PendingPage = {
  /** Page title. Factual identity of the route, not marketing copy. */
  title: string;
};

export const PENDING_PAGES: Record<string, PendingPage> = {
  "copy-trading": { title: "Copy Trading" },
  packages: { title: "Packages" },
  traders: { title: "Traders" },
  community: { title: "Community" },
  network: { title: "Network" },
  education: { title: "Education" },
  about: { title: "About" },
  contact: { title: "Contact" },
  faq: { title: "FAQ" },
  blog: { title: "Blog" },
};

export const PENDING_LEGAL_PAGES: Record<string, PendingPage> = {
  "risk-disclosure": { title: "Risk Disclosure" },
  terms: { title: "Terms of Service" },
  privacy: { title: "Privacy Policy" },
  cookies: { title: "Cookie Policy" },
};

/** Top-level pending paths, e.g. `["/copy-trading", "/packages", ...]`. */
export const PENDING_TOP_LEVEL_PATHS = Object.keys(PENDING_PAGES).map(
  (slug) => `/${slug}`,
);

export const PENDING_LEGAL_PATHS = Object.keys(PENDING_LEGAL_PAGES).map(
  (slug) => `/legal/${slug}`,
);

/** Every path that exists-but-is-unpublished. The guard test walks this. */
export const ALL_PENDING_PATHS = [
  ...PENDING_TOP_LEVEL_PATHS,
  ...PENDING_LEGAL_PATHS,
];
