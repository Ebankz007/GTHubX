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
 * Areas not yet built (packages, copy, network, content,
 * blog, faq, media, messages) are absent rather than listed with dead hrefs.
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
    href: "/admin/kyc",
    label: "Verification",
    description: "Identity submissions and decisions",
    permission: "kyc",
  },
  {
    href: "/admin/payments",
    label: "Payments",
    description: "Registration payments and settlement",
    permission: "deposits",
  },
  {
    href: "/admin/payouts",
    label: "Payouts",
    description: "Member withdrawal requests",
    permission: "withdrawals",
  },
  {
    href: "/admin/rank-awards",
    label: "Rank awards",
    description: "Milestone rewards and flags",
    permission: "withdrawals",
  },
  {
    href: "/admin/community",
    label: "Community",
    description: "Posts and comments",
    permission: "community",
  },
  {
    href: "/admin/team",
    label: "Team",
    description: "Admin accounts and roles",
    permission: "team",
  },
  {
    href: "/admin/reports",
    label: "Reports",
    description: "Breakdowns and trends",
    permission: "reports",
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
