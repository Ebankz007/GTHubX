import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageForm } from "@/components/dashboard/forms";

export const metadata = { title: "Ticket" };

const statusVariant: Record<string, "outline" | "success" | "warning" | "danger"> = {
  OPEN: "success",
  PENDING: "warning",
  RESOLVED: "outline",
  CLOSED: "outline",
};

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Scoped to the caller's own tickets. Someone else's id is a 404, not a 403 —
  // a permission error would confirm that the id exists.
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, userId: user.id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { fullName: true } } },
      },
    },
  });
  if (!ticket) notFound();

  const canReply = ticket.status === "OPEN" || ticket.status === "PENDING";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/support" className="text-sm text-brand">
          ← Back to support
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {ticket.subject}
          </h1>
          <Badge variant={statusVariant[ticket.status] ?? "outline"}>
            {ticket.status}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-faint">
          {ticket.category.replace("_", " ")} · priority {ticket.priority.toLowerCase()} ·
          opened {ticket.createdAt.toLocaleDateString("en-US", { dateStyle: "long" })}
        </p>
      </div>

      <ul className="space-y-4">
        {ticket.messages.map((message) => {
          const isStaff = message.authorRole === "STAFF";
          return (
            <li key={message.id}>
              <Card className={isStaff ? "border-brand/40" : ""}>
                <CardContent className="p-5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {message.author?.fullName ?? (isStaff ? "Support team" : "Removed member")}
                      </span>
                      <Badge variant={isStaff ? "brand" : "outline"}>
                        {isStaff ? "Staff" : "You"}
                      </Badge>
                    </div>
                    <time className="text-xs text-faint">
                      {message.createdAt.toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted">{message.body}</p>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {canReply ? (
        <Card>
          <CardHeader>
            <CardTitle>Reply</CardTitle>
          </CardHeader>
          <CardContent>
            <MessageForm
              endpoint={`/api/support/${ticket.id}/messages`}
              label="Your reply"
              placeholder="Add anything that helps us understand the issue."
              submitLabel="Send reply"
              successMessage="Reply sent."
            />
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-faint">
          This ticket is {ticket.status.toLowerCase()} and is no longer accepting
          replies.{" "}
          <Link href="/dashboard/support/new" className="text-brand">
            Open a new ticket
          </Link>{" "}
          if you need more help.
        </p>
      )}
    </div>
  );
}
