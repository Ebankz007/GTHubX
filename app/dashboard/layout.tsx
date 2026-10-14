import { requireUser } from "@/lib/auth";
import { PortalShell } from "@/components/dashboard/portal-shell";

export const metadata = {
  title: { template: "%s · Member Portal", default: "Member Portal" },
};

/**
 * Every route under `/dashboard` is member-only. The guard lives in the layout
 * so no child page can forget it — the same reasoning as `requireAdminPermission`
 * on the admin side (an action is an entry point, not a helper).
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <PortalShell
      user={{
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        kycStatus: user.kycStatus,
        emailVerified: Boolean(user.emailVerifiedAt),
      }}
    >
      {children}
    </PortalShell>
  );
}
