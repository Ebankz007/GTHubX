import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/dashboard/settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  const full = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      fullName: true,
      email: true,
      phone: true,
      country: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!full) throw new Error("Settings: user row disappeared mid-request");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your profile details and account status.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Your email is your sign-in identity and cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            initial={{
              fullName: full.fullName,
              phone: full.phone ?? "",
              country: full.country ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Read-only details recorded on your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-faint">Email</dt>
              <dd className="mt-1 text-sm text-foreground">{full.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-faint">Role</dt>
              <dd className="mt-1">
                <Badge variant="brand">{full.role}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-faint">Member since</dt>
              <dd className="mt-1 text-sm text-foreground">
                {full.createdAt.toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-faint">Last sign-in</dt>
              <dd className="mt-1 text-sm text-foreground">
                {full.lastLoginAt
                  ? full.lastLoginAt.toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "No recorded sign-in"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
