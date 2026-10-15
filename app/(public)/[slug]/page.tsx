import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PendingShell } from "@/components/site/pending-shell";
import { PENDING_PAGES } from "@/lib/pending-pages";

type PageProps = { params: Promise<{ slug: string }> };

/**
 * Public top-level routes that exist but are not yet published.
 *
 * The whitelist in `lib/pending-pages.ts` is the contract: anything not on it
 * still 404s. That matters — an open catch-all would quietly turn every typo'd
 * or forgotten link into a plausible-looking page and destroy the signal we
 * rely on to find dead links.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = PENDING_PAGES[slug];
  if (!page) return {};
  // Unpublished content should not be indexed; flip this when copy lands.
  return { title: page.title, robots: { index: false, follow: true } };
}

export default async function PendingPublicPage({ params }: PageProps) {
  const { slug } = await params;
  const page = PENDING_PAGES[slug];
  if (!page) notFound();

  return <PendingShell title={page.title} />;
}
