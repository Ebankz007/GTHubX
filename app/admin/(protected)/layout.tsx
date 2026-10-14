import { requireAdmin } from "@/lib/auth";
import { AdminShell } from "@/components/admin/shell";

export const metadata = {
  title: { template: "%s · Admin", default: "Admin" },
};

/**
 * Every route inside `(protected)` is admin-only. The guard lives here so no
 * child page can forget it — the same reason `requireUser()` sits in
 * `app/dashboard/layout.tsx`.
 *
 * Authentication is enforced once, here. *Authorisation* (which permission a
 * given area needs) is enforced per page by `requireAdminPermission`, because
 * only the page knows which area it is serving.
 */
export default async function AdminProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdmin();

  return (
    <AdminShell
      admin={{ name: admin.name, email: admin.email, role: admin.role }}
    >
      {children}
    </AdminShell>
  );
}
