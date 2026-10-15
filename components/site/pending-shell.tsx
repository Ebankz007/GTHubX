import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";

/**
 * The shape every public page gets: site chrome top and bottom, one honest
 * statement about the page's status, and links that actually work.
 *
 * Deliberately contains no descriptive copy about what the page will cover —
 * that would be inventing content, which PLAN §3 forbids and which is the
 * author's to write, not ours to guess.
 */
export function PendingShell({ title }: { title: string }) {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[52vh] max-w-3xl flex-col justify-center px-4 py-24 sm:px-6">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brand">
          Not yet published
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted">
          This page exists but its content has not been published yet. Nothing
          is hidden behind it and there is no placeholder material here to
          mistake for the real thing.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-brand/50"
          >
            Sign in
          </Link>
          <Link
            href="/"
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-muted transition-colors hover:text-foreground"
          >
            Back home
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
