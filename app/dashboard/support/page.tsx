import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Support" };

const statusVariant: Record<string, "outline" | "success" | "warning" | "danger"> = {
  OPEN: "success",
  PENDING: "warning",
  RESOLVED: "outline",
  CLOSED: "outline",
};

const priorityVariant: Record<string, "outline" | "warning" | "danger"> = {
  LOW: "outline",
  NORMAL: "outline",
  HIGH: "warning",
  URGENT: "danger",
};

export default async function SupportPage() {
  const user = await requireUser();

  const [tickets, openCount] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { lastMessageAt: "desc" },
      include: { _count: { select: { messages: true } } },
    }),
    prisma.supportTicket.count({
      where: { userId: user.id, status: { in: ["OPEN", "PENDING"] } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Support
          </h1>
          <p className="mt-1 text-sm text-muted">
            {openCount > 0
              ? `${openCount} open ${openCount === 1 ? "ticket" : "tickets"}.`
              : "No open tickets."}
          </p>
        </div>
        <Link
          href="/dashboard/support/new"
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          Open a ticket
        </Link>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-faint">
              You have not contacted support yet. If something looks wrong with
              your account, open a ticket and our team will pick it up.
            </p>
            <Link
              href="/dashboard/support/new"
              className="mt-4 inline-block rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10"
            >
              Open your first ticket
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link href={`/dashboard/support/${ticket.id}`} className="block">
                <Card className="card-hover transition-colors">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {ticket.subject}
                      </p>
                      <p className="mt-1 text-xs text-faint">
                        {ticket.category.replace("_", " ")} ·{" "}
                        {ticket._count.messages}{" "}
                        {ticket._count.messages === 1 ? "message" : "messages"} · updated{" "}
                        {ticket.lastMessageAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={priorityVariant[ticket.priority] ?? "outline"}>
                        {ticket.priority}
                      </Badge>
                      <Badge variant={statusVariant[ticket.status] ?? "outline"}>
                        {ticket.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
