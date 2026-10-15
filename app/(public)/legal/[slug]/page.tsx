import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PendingShell } from "@/components/site/pending-shell";
import { PENDING_LEGAL_PAGES } from "@/lib/pending-pages";

type PageProps = { params: Promise<{ slug: string }> };

/**
 * Legal routes exist (the footer has always pointed at /legal/*) but carry no
 * text until Henry's copy arrives. We render an honest unpublished state rather
 * than drafting terms, a risk disclosure, or a privacy policy ourselves — that
 * is legal authorship, not engineering.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = PENDING_LEGAL_PAGES[slug];
  if (!page) return {};
  return { title: page.title, robots: { index: false, follow: true } };
}

export default async function PendingLegalPage({ params }: PageProps) {
  const { slug } = await params;
  const page = PENDING_LEGAL_PAGES[slug];
  if (!page) notFound();

  return <PendingShell title={page.title} />;
}
