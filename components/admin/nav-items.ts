import type { Permission } from "@/lib/rbac";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  permission: Permission;
};

/**
 * Admin destinations that actually exist. Each names the permission it needs —
 * the shell hides what the signed-in role lacks, and the page itself re-checks
 * with `requireAdminPermission`. The nav filter is a courtesy; the page guard
 * is the gate.
 *
 * Areas not yet built (kyc, deposits, withdrawals, packages, copy, network,
 * community, content, blog, faq, media, messages, reports) are absent rather
 * than listed with dead hrefs.
 */
export const adminNavItems: AdminNavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    description: "Platform overview",
    permission: "dashboard",
  },
  {
    href: "/admin/users",
    label: "Users",
    description: "Member accounts and status",
    permission: "users",
  },
  {
    href: "/admin/team",
    label: "Team",
    description: "Admin accounts and roles",
    permission: "team",
  },
  {
    href: "/admin/settings",
    label: "Settings",
    description: "Public-facing site copy",
    permission: "settings",
  },
  {
    href: "/admin/audit",
    label: "Audit log",
    description: "Recorded sensitive actions",
    permission: "audit",
  },
];
