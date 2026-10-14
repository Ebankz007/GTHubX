"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Logo } from "@/components/site/logo";
import { Badge } from "@/components/ui/badge";
import { adminNavItems } from "@/components/admin/nav-items";
import { hasPermission, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import type { AdminRole } from "@/lib/generated/prisma/enums";

export type AdminShellUser = {
  name: string;
  email: string;
  role: AdminRole;
};

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

function NavList({
  pathname,
  role,
  onNavigate,
}: {
  pathname: string;
  role: AdminRole;
  onNavigate?: () => void;
}) {
  const visible = adminNavItems.filter((item) => hasPermission(role, item.permission));

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {visible.length === 0 ? (
        <p className="px-3 py-2 text-xs text-faint">
          Your role has no assigned areas yet.
        </p>
      ) : (
        visible.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={item.description}
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
        })
      )}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-border px-5 py-4">
      <form action="/api/admin/logout" method="post">
        <button
          type="submit"
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-elevated hover:text-foreground"
        >
          Sign out
        </button>
      </form>
      <Link
        href="/"
        className="mt-2 block px-3 text-xs text-faint hover:text-muted"
      >
        ← Back to site
      </Link>
    </div>
  );
}

/**
 * Admin chrome. Mirrors `PortalShell`, but the nav is filtered by role — a
 * FINANCE_ADMIN never sees an "Audit log" link it could not open anyway.
 */
export function AdminShell({
  admin,
  children,
}: {
  admin: AdminShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-20" />

      <header className="sticky top-0 z-30 border-b border-border glass lg:pl-64">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="admin-drawer"
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
              <p className="text-sm font-semibold text-foreground">{admin.name}</p>
              <p className="text-xs text-faint">{admin.email}</p>
            </div>
            <Badge variant={admin.role === "SUPER_ADMIN" ? "brand" : "outline"}>
              {admin.role.replace("_", " ")}
            </Badge>
          </div>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-16 items-center justify-between border-b border-border px-5">
          <Link href="/" aria-label="Global Traders HubX home">
            <Logo />
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand">
            Admin
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavList pathname={pathname} role={admin.role} />
        </div>
        <SidebarFooter />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <aside
            id="admin-drawer"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface"
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <Link href="/" aria-label="Global Traders HubX home">
                <Logo />
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4">
              <NavList
                pathname={pathname}
                role={admin.role}
                onNavigate={() => setOpen(false)}
              />
            </div>
            <SidebarFooter />
          </aside>
        </div>
      )}

      <main className="relative z-10 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</div>
      </main>
    </div>
  );
}

/** Re-export so pages can assert their own permission without importing rbac twice. */
export type { Permission };
