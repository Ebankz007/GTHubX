import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Users" };

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  // Fails closed: a role without `users` is redirected before a query runs.
  await requireAdminPermission("users");

  const { page: pageRaw, q } = await searchParams;
  const requested = Number.parseInt(pageRaw ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const search = (q ?? "").trim();

  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: "insensitive" as const } },
          { fullName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        kycStatus: true,
        role: true,
        sponsorId: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Users
        </h1>
        <p className="mt-1 text-sm text-muted">
          {total.toLocaleString("en-US")} member {total === 1 ? "account" : "accounts"}.
        </p>
      </div>

      <form method="get" action="/admin/users" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search members
        </label>
        <input
          id="q"
          name="q"
          defaultValue={search}
          placeholder="Search by name or email…"
          className="h-11 w-full max-w-sm rounded-xl border border-border bg-elevated px-3.5 text-sm text-foreground placeholder:text-faint focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
        <button
          type="submit"
          className="h-11 shrink-0 rounded-lg border border-border-strong px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand/10"
        >
          Search
        </button>
      </form>

      {users.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-faint">
              {search ? `No members match “${search}”.` : "No members registered yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Member</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Role</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">KYC</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Referred by</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Last seen</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => (
                    <tr key={u.id} className="transition-colors hover:bg-elevated/50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-foreground">{u.fullName}</p>
                        <p className="text-xs text-faint">{u.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={u.role === "TRADER" ? "brand" : "outline"}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant={
                            u.status === "ACTIVE"
                              ? "success"
                              : u.status === "SUSPENDED"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {u.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant={
                            u.kycStatus === "VERIFIED"
                              ? "success"
                              : u.kycStatus === "REJECTED"
                                ? "danger"
                                : u.kycStatus === "PENDING"
                                  ? "warning"
                                  : "outline"
                          }
                        >
                          {u.kycStatus.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-faint">
                        {u.sponsorId ? "Recorded" : "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-faint">
                        {u.lastLoginAt
                          ? u.lastLoginAt.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Never"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-faint">
                        {u.createdAt.toLocaleDateString("en-US", {
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
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <nav aria-label="User pages" className="flex items-center justify-between">
          {page > 1 ? (
            <a href={`/admin/users?page=${page - 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`} className="text-sm text-brand">
              ← Previous
            </a>
          ) : (
            <span className="text-sm text-faint">← Previous</span>
          )}
          <span className="text-xs text-faint">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <a href={`/admin/users?page=${page + 1}${search ? `&q=${encodeURIComponent(search)}` : ""}`} className="text-sm text-brand">
              Next →
            </a>
          ) : (
            <span className="text-sm text-faint">Next →</span>
          )}
        </nav>
      )}
    </div>
  );
}
