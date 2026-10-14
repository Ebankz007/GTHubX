import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ForbiddenError,
  hasPermission,
  permissionForAdminPath,
  requirePermission,
  rolePermissions,
} from "@/lib/rbac";
import type { AdminRole } from "@/lib/generated/prisma/enums";

describe("role → permission matrix", () => {
  it("grants SUPER_ADMIN every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("SUPER_ADMIN", permission)).toBe(true);
    }
  });

  it("keeps non-super roles out of the superadmin surface", () => {
    const nonSuper = (Object.keys(ROLE_PERMISSIONS) as AdminRole[]).filter(
      (role) => role !== "SUPER_ADMIN",
    );
    for (const role of nonSuper) {
      expect(hasPermission(role, "team")).toBe(false);
      expect(hasPermission(role, "settings")).toBe(false);
      expect(hasPermission(role, "audit")).toBe(false);
    }
  });

  it("scopes each role to its own domain", () => {
    expect(hasPermission("CONTENT_ADMIN", "blog")).toBe(true);
    expect(hasPermission("CONTENT_ADMIN", "users")).toBe(false);
    expect(hasPermission("FINANCE_ADMIN", "withdrawals")).toBe(true);
    expect(hasPermission("FINANCE_ADMIN", "content")).toBe(false);
    expect(hasPermission("TRADER_ADMIN", "copytrading")).toBe(true);
    expect(hasPermission("TRADER_ADMIN", "deposits")).toBe(false);
  });

  it("gives every role the dashboard", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as AdminRole[]) {
      expect(hasPermission(role, "dashboard")).toBe(true);
    }
  });

  it("returns an empty list for an unknown role", () => {
    expect(rolePermissions("NOPE" as AdminRole)).toEqual([]);
  });
});

describe("requirePermission", () => {
  it("passes when the permission is held", () => {
    expect(() => requirePermission("SUPER_ADMIN", "settings")).not.toThrow();
  });

  it("throws ForbiddenError naming the missing permission", () => {
    try {
      requirePermission("SUPPORT_ADMIN", "withdrawals");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).permission).toBe("withdrawals");
    }
  });
});

describe("permissionForAdminPath", () => {
  it("maps /admin itself to the dashboard permission", () => {
    expect(permissionForAdminPath("/admin")).toBe("dashboard");
    expect(permissionForAdminPath("/admin/")).toBe("dashboard");
  });

  it("maps known areas, including nested paths", () => {
    expect(permissionForAdminPath("/admin/users")).toBe("users");
    expect(permissionForAdminPath("/admin/users/abc123")).toBe("users");
    expect(permissionForAdminPath("/admin/withdrawals/42")).toBe("withdrawals");
  });

  it("fails closed on an unmapped area", () => {
    expect(permissionForAdminPath("/admin/secret-area")).toBeNull();
    expect(permissionForAdminPath("/admin/unknown/deep")).toBeNull();
  });
});
