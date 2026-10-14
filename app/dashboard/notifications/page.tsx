import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted">
            Account and platform messages.
          </p>
        </div>

        {notifications.some((n) => !n.readAt) && (
          <form action="/api/account/notifications/read-all" method="post">
            <button
              type="submit"
              className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10"
            >
              Mark all as read
            </button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-faint">
              Nothing here yet. Notifications appear when your account status
              changes, a payout is recorded, or support replies to a ticket.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card className={n.readAt ? "" : "border-brand/40"}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-faint">
                        {n.createdAt.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-2 text-right">
                      {!n.readAt && (
                        <span className="inline-block rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-semibold text-brand">
                          New
                        </span>
                      )}
                      {n.link && (
                        <div>
                          <Link
                            href={n.link}
                            className="text-sm text-brand hover:underline"
                          >
                            View
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
