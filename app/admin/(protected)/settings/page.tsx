import { requireAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SETTING_DEFINITIONS } from "@/lib/site-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingForm } from "@/components/admin/settings-form";

export const metadata = { title: "Settings" };

/**
 * Public-facing site settings. Every key here is on the allowlist in
 * `lib/site-settings.ts` — the API refuses anything else, so this page can only
 * ever write values the rest of the site actually reads.
 */
export default async function AdminSettingsPage() {
  await requireAdminPermission("settings");

  const rows = await prisma.siteSetting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value as Record<string, unknown>]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Public-facing copy. Every change is recorded in the audit log.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {SETTING_DEFINITIONS.map((def) => {
          const value = byKey.get(def.key);
          return (
            <Card key={def.key}>
              <CardHeader>
                <CardTitle>{def.title}</CardTitle>
                <CardDescription>
                  {value === undefined
                    ? "Not present in the database — saving is refused until it is seeded."
                    : def.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {value === undefined ? (
                  <p className="text-sm text-faint">
                    Missing. Run <code className="font-mono">pnpm db:seed</code>.
                  </p>
                ) : (
                  <SettingForm definition={def} initial={value} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
