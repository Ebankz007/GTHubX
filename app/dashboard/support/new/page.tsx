import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SupportForm } from "@/components/dashboard/forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Open a ticket" };

export default async function NewTicketPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/support" className="text-sm text-brand">
          ← Back to support
        </Link>
        <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground">
          Open a ticket
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tell us what is happening. The more detail you give, the faster we can
          resolve it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New ticket</CardTitle>
          <CardDescription>
            We reply inside the platform — watch your notifications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SupportForm />
        </CardContent>
      </Card>
    </div>
  );
}
