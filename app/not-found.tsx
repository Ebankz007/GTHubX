import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/site/logo";

export default function NotFound() {
  return (
    <main className="glow-brand flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="mt-10 font-display text-7xl font-bold tracking-tight text-gradient-brand">
        404
      </p>
      <h1 className="mt-4 font-display text-2xl font-semibold">
        This page could not be found.
      </h1>
      <p className="mt-3 max-w-md text-muted">
        The page you are looking for may have moved, or never existed. Let&apos;s
        get you back to the hub.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Back to home</ButtonLink>
        <Link
          href="/contact"
          className="inline-flex h-11 items-center px-5 text-sm text-muted hover:text-brand"
        >
          Contact support
        </Link>
      </div>
    </main>
  );
}
