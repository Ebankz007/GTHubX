import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

/**
 * Read-only view of `AuditLog`.
 *
 * Note the shape of the trail: entries are written by `recordAudit` on
 * sensitive actions and carry an optional `adminId`. Rows with no admin are
 * system-authored. Nothing here can be edited or deleted from the UI — an
 * audit log with a delete button is not an audit log.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdminPermission("audit");

  const { page: pageRaw } = await searchParams;
  const requested = Number.parseInt(pageRaw ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;

  const [total, entries] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { admin: { select: { name: true, email: true, role: true } } },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Audit log
        </h1>
        <p className="mt-1 text-sm text-muted">
          {total.toLocaleString("en-US")} recorded {total === 1 ? "entry" : "entries"}.
          Read-only — this trail is never edited or removed.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No entries yet</CardTitle>
            <CardDescription>
              Entries appear as sensitive actions are taken — suspensions,
              payout approvals, role changes, setting edits.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">When</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Action</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Entity</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">Actor</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-elevated/50">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-faint">
                        {entry.createdAt.toLocaleString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="outline">{entry.action}</Badge>
                      </td>
                      <td className="px-5 py-3 text-muted">
                        {entry.entity}
                        {entry.entityId ? (
                          <span className="block max-w-[12rem] truncate font-mono text-[11px] text-faint">
                            {entry.entityId}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        {entry.admin ? (
                          <>
                            <p className="text-foreground">{entry.admin.name}</p>
                            <p className="text-xs text-faint">
                              {entry.admin.role.replace("_", " ")}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-faint">System</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-faint">
                        {entry.ip ?? "—"}
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
        <nav aria-label="Audit pages" className="flex items-center justify-between">
          {page > 1 ? (
            <a href={`/admin/audit?page=${page - 1}`} className="text-sm text-brand">← Previous</a>
          ) : (
            <span className="text-sm text-faint">← Previous</span>
          )}
          <span className="text-xs text-faint">Page {page} of {pages}</span>
          {page < pages ? (
            <a href={`/admin/audit?page=${page + 1}`} className="text-sm text-brand">Next →</a>
          ) : (
            <span className="text-sm text-faint">Next →</span>
          )}
        </nav>
      )}
    </div>
  );
}
