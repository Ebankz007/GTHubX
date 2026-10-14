import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Transactions" };

const PAGE_SIZE = 25;

const typeLabel: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  COMMISSION: "Commission",
  FEE: "Fee",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
  SUBSCRIPTION: "Subscription",
};

function pageHref(page: number) {
  return page <= 1 ? "/dashboard/transactions" : `/dashboard/transactions?page=${page}`;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const { page: pageRaw } = await searchParams;

  const requested = Number.parseInt(pageRaw ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;
  const skip = (page - 1) * PAGE_SIZE;

  const [total, entries] = await Promise.all([
    prisma.ledgerEntry.count({ where: { userId: user.id } }),
    prisma.ledgerEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const lastEntry = entries[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Transactions
        </h1>
        <p className="mt-1 text-sm text-muted">
          Every movement recorded against your account, in ledger order.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-faint">Entries</p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">
            {total.toLocaleString("en-US")}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-faint">Page</p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">
            {page} of {pages}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-faint">Latest balance</p>
          <p className="mt-1 font-display text-xl font-bold text-foreground">
            {lastEntry
              ? formatCents(lastEntry.balanceAfterCents, lastEntry.currency)
              : "$0.00"}
          </p>
        </Card>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-faint">
              {page > 1
                ? "Nothing on this page — you may have reached the end of your history."
                : "No transactions yet. Ledger entries appear here once a commission, subscription or payout is recorded against your account."}
            </p>
            {page > 1 && (
              <Link href={pageHref(1)} className="mt-3 inline-block text-sm text-brand">
                Back to the first page
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      Date
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      Type
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-faint">
                      Description
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-faint">
                      Amount
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-faint">
                      Balance after
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-elevated/50">
                      <td className="whitespace-nowrap px-5 py-3 text-faint">
                        {entry.createdAt.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant="outline">{typeLabel[entry.type] ?? entry.type}</Badge>
                      </td>
                      <td className="max-w-xs px-5 py-3 text-muted">
                        <span className="block truncate">
                          {entry.description ?? "—"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-mono">
                        <span
                          className={
                            entry.direction === "CREDIT"
                              ? "text-emerald"
                              : "text-foreground"
                          }
                        >
                          {entry.direction === "CREDIT" ? "+" : "−"}
                          {formatCents(entry.amountCents, entry.currency)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-mono text-muted">
                        {formatCents(entry.balanceAfterCents, entry.currency)}
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
        <nav aria-label="Transaction pages" className="flex items-center justify-between">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-sm text-brand">
              ← Previous
            </Link>
          ) : (
            <span className="text-sm text-faint">← Previous</span>
          )}
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="text-sm text-brand">
              Next →
            </Link>
          ) : (
            <span className="text-sm text-faint">Next →</span>
          )}
        </nav>
      )}
    </div>
  );
}
