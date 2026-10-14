import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const admin = await requireAdminPermission("dashboard");

  const [
    totalMembers,
    activeMembers,
    pendingMembers,
    suspendedMembers,
    pendingKyc,
    openTickets,
    totalAdmins,
    recentMembers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.user.count({ where: { kycStatus: "PENDING" } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
    prisma.admin.count({ where: { isActive: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        kycStatus: true,
        createdAt: true,
      },
    }),
  ]);

  const stats = [
    { label: "Members", value: totalMembers, note: `${activeMembers} active` },
    { label: "Pending signups", value: pendingMembers, note: "Awaiting verification" },
    { label: "Suspended", value: suspendedMembers, note: "Access revoked" },
    { label: "KYC in review", value: pendingKyc, note: "Documents awaiting check" },
    { label: "Open tickets", value: openTickets, note: "Support queue" },
    { label: "Active admins", value: totalAdmins, note: "Staff accounts" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Signed in as {admin.name} · {admin.role.replace("_", " ")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-5">
            <p className="text-xs uppercase tracking-wide text-faint">{stat.label}</p>
            <p className="mt-1 font-display text-3xl font-bold text-foreground">
              {stat.value.toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-xs text-faint">{stat.note}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <CardTitle>Newest members</CardTitle>
              <CardDescription>The eight most recent registrations</CardDescription>
            </div>
            {hasPermission(admin.role, "users") && (
              <Link href="/admin/users" className="text-sm text-brand">
                View all users →
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentMembers.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-faint">No members registered yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Member</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-faint">KYC</th>
                    <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentMembers.map((m) => (
                    <tr key={m.id} className="transition-colors hover:bg-elevated/50">
                      <td className="px-6 py-3">
                        <p className="font-medium text-foreground">{m.fullName}</p>
                        <p className="text-xs text-faint">{m.email}</p>
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          variant={
                            m.status === "ACTIVE"
                              ? "success"
                              : m.status === "SUSPENDED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {m.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3">
                        <Badge
                          variant={
                            m.kycStatus === "VERIFIED"
                              ? "success"
                              : m.kycStatus === "REJECTED"
                                ? "danger"
                                : m.kycStatus === "PENDING"
                                  ? "warning"
                                  : "outline"
                          }
                        >
                          {m.kycStatus.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-faint">
                        {m.createdAt.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
