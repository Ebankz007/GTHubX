"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/site/logo";
import { Badge } from "@/components/ui/badge";
import { navItems } from "@/components/dashboard/nav-items";
import { cn } from "@/lib/utils";
import type { KycStatus, UserRole } from "@/lib/generated/prisma/enums";

export type PortalUser = {
  fullName: string;
  email: string;
  role: UserRole;
  kycStatus: KycStatus;
  emailVerified: boolean;
};

function isActive(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

function NavList({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Member portal" className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-brand/12 font-semibold text-brand"
                : "text-muted hover:bg-elevated hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-border px-5 py-4">
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-elevated hover:text-foreground"
        >
          Sign out
        </button>
      </form>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Trading involves risk, including possible loss of capital. Global Traders
        HubX is a community platform — not a broker, fund manager, or investment
        advisor.
      </p>
    </div>
  );
}

/**
 * The member-portal chrome: fixed sidebar on desktop, a disclosure drawer on
 * small screens. Split out from the layout so `requireUser()` stays on the
 * server and this file never touches the session directly.
 */
export function PortalShell({
  user,
  children,
}: {
  user: PortalUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // A drawer left open across a navigation would cover the page it navigated to.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const kycLabel: Record<KycStatus, string> = {
    NOT_STARTED: "Not started",
    PENDING: "In review",
    VERIFIED: "Verified",
    REJECTED: "Action needed",
  };
  const kycVariant: Record<KycStatus, "outline" | "warning" | "success" | "danger"> = {
    NOT_STARTED: "outline",
    PENDING: "warning",
    VERIFIED: "success",
    REJECTED: "danger",
  };

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-20" />

      {/* Top bar — always visible. */}
      <header className="sticky top-0 z-30 border-b border-border glass lg:pl-64">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="portal-drawer"
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-elevated hover:text-foreground lg:hidden"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? (
                <>
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </>
              ) : (
                <>
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                </>
              )}
            </svg>
          </button>

          <Link href="/" className="lg:hidden" aria-label="Global Traders HubX home">
            <Logo />
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-foreground">{user.fullName}</p>
              <p className="text-xs text-faint">{user.email}</p>
            </div>
            <Badge variant={kycVariant[user.kycStatus]}>
              {kycLabel[user.kycStatus]}
            </Badge>
          </div>
        </div>
      </header>

      {/* Desktop sidebar. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link href="/" aria-label="Global Traders HubX home">
            <Logo />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList pathname={pathname} />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile drawer. */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <aside
            id="portal-drawer"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface"
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <Link href="/" aria-label="Global Traders HubX home">
                <Logo />
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter />
          </aside>
        </div>
      )}

      <main className="relative z-10 lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>
      </main>
    </div>
  );
}
