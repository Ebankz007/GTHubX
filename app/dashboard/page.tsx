import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Logo } from "@/components/site/logo";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Dashboard" };

/**
 * Phase 3 placeholder — proves the session guard end to end.
 * The real member portal is Phase 4 and will replace this page.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />
      <header className="relative z-10 border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/">
            <Logo />
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="card p-7">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Welcome, {user.fullName}
            </h1>
            <Badge variant="brand">{user.role}</Badge>
            {user.emailVerifiedAt ? (
              <Badge variant="success">Verified</Badge>
            ) : (
              <Badge variant="warning">Email unverified</Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">{user.email}</p>
          <p className="mt-6 text-sm text-faint">
            The member portal (dashboard, network, earnings, payouts) arrives in
            Phase 4.
          </p>
        </div>
      </main>
    </div>
  );
}
