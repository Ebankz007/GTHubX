import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rolePermissions } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamActions } from "@/components/admin/team-actions";

export const metadata = { title: "Team" };

/**
 * Admin accounts and roles. `team` is held by SUPER_ADMIN only, so this whole
 * area is superadmin territory; every row's edit also re-checks server-side.
 */
export default async function AdminTeamPage() {
  const me = await requireAdminPermission("team");

  const admins = await prisma.admin.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  const activeSuperAdmins = admins.filter(
    (a) => a.role === "SUPER_ADMIN" && a.isActive,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Team
        </h1>
        <p className="mt-1 text-sm text-muted">
          {admins.length} admin {admins.length === 1 ? "account" : "accounts"} ·{" "}
          {activeSuperAdmins} active{" "}
          {activeSuperAdmins === 1 ? "superadmin" : "superadmins"}
        </p>
      </div>

      {activeSuperAdmins <= 1 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-sm text-warning">
              Only {activeSuperAdmins} active SUPER_ADMIN
            </CardTitle>
            <CardDescription>
              The last active superadmin cannot be demoted or deactivated —
              promote another admin to SUPER_ADMIN first, or you would lose
              platform-wide access.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Admin accounts</CardTitle>
          <CardDescription>
            Changing a role takes effect on that admin&apos;s next request.
            Deactivation takes effect immediately — their session stops working
            without waiting to be revoked.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Admin</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Role</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Access</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Last sign-in</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Permissions</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {admins.map((a) => {
                  const isSelf = a.id === me.id;
                  return (
                    <tr key={a.id} className="align-top transition-colors hover:bg-elevated/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">
                          {a.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-faint">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-faint">{a.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={a.role === "SUPER_ADMIN" ? "brand" : "outline"}>
                          {a.role.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={a.isActive ? "success" : "danger"}>
                          {a.isActive ? "Active" : "Suspended"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-faint">
                        {a.lastLoginAt
                          ? a.lastLoginAt.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Never"}
                      </td>
                      <td className="px-5 py-3">
                        <p className="max-w-[14rem] text-xs text-faint">
                          {rolePermissions(a.role).length} of 20 permissions
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <TeamActions
                          adminId={a.id}
                          isSelf={isSelf}
                          initialRole={a.role}
                          isActive={a.isActive}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
