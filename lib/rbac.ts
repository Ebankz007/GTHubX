import type { AdminRole } from "@/lib/generated/prisma/enums";

/**
 * The permission vocabulary (ARCHITECTURE.md §6). Every guarded page and every
 * guarded action names one of these — nothing else.
 */
export const PERMISSIONS = [
  "dashboard",
  "content",
  "blog",
  "faq",
  "media",
  "users",
  "kyc",
  "messages",
  "packages",
  "copytrading",
  "network",
  "community",
  "education",
  "deposits",
  "withdrawals",
  "ledger",
  "reports",
  "settings",
  "audit",
  "team",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role → permissions. **No role inherits SUPER_ADMIN by default** — the
 * superadmin grant is written out explicitly so a new role cannot silently
 * become one by omission.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  SUPER_ADMIN: PERMISSIONS,
  CONTENT_ADMIN: [
    "dashboard",
    "content",
    "blog",
    "faq",
    "media",
    "education",
    "community",
  ],
  SUPPORT_ADMIN: ["dashboard", "users", "messages", "kyc", "community"],
  FINANCE_ADMIN: [
    "dashboard",
    "packages",
    "deposits",
    "withdrawals",
    "ledger",
    "reports",
  ],
  NETWORK_ADMIN: ["dashboard", "network", "reports"],
  TRADER_ADMIN: ["dashboard", "copytrading"],
};

export function rolePermissions(role: AdminRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: AdminRole, permission: Permission): boolean {
  return rolePermissions(role).includes(permission);
}

export class ForbiddenError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`Forbidden: missing permission "${permission}"`);
    this.name = "ForbiddenError";
    this.permission = permission;
  }
}

/** Throw unless the role holds the permission. Used inside server actions. */
export function requirePermission(role: AdminRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(permission);
  }
}

/**
 * Admin area (first path segment under /admin) → required permission.
 * Deliberately explicit: an unmapped area returns `null` and the caller must
 * **fail closed** (403), never default to "allowed".
 */
export const ADMIN_AREA_PERMISSIONS: Record<string, Permission> = {
  users: "users",
  kyc: "kyc",
  deposits: "deposits",
  withdrawals: "withdrawals",
  packages: "packages",
  copy: "copytrading",
  network: "network",
  community: "community",
  content: "content",
  blog: "blog",
  faq: "faq",
  media: "media",
  messages: "messages",
  settings: "settings",
  audit: "audit",
  team: "team",
  reports: "reports",
};

/**
 * Resolve the permission an /admin path requires.
 * `/admin` itself → `dashboard`. An unknown area → `null` (unmapped → deny).
 */
export function permissionForAdminPath(pathname: string): Permission | null {
  const rest = pathname.replace(/^\/admin\/?/, "");
  const segment = rest.split("/")[0];
  if (!segment) return "dashboard";
  return ADMIN_AREA_PERMISSIONS[segment] ?? null;
}
