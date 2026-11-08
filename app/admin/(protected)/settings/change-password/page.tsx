import { requireAdminPermission } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/admin/change-password-form";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  await requireAdminPermission("settings");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Change password
        </h1>
        <p className="mt-1 text-sm text-muted">
          Replace your admin password. The new one takes effect immediately.
        </p>
      </div>

      <ChangePasswordForm />
    </div>
  );
}
