import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3500";

const PUBLIC_ROUTES = [
  "",
  "/copy-trading",
  "/packages",
  "/traders",
  "/community",
  "/network",
  "/education",
  "/about",
  "/contact",
  "/faq",
  "/blog",
  "/login",
  "/register",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
