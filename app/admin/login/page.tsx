import Link from "next/link";
import { getCurrentAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Logo } from "@/components/site/logo";
import { AdminLoginForm } from "@/components/admin/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Admin sign in" };

/** Standalone — deliberately outside the `(protected)` group so it is not guarded. */
export default async function AdminLoginPage() {
  const existing = await getCurrentAdmin();
  if (existing) redirect("/admin");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-40" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[440px] w-[720px] -translate-x-1/2 rounded-full bg-brand/10 blur-[130px]" />

      <div className="relative z-10 w-full max-w-md">
        <Link
          href="/"
          className="mb-8 flex justify-center transition-opacity hover:opacity-90"
          aria-label="Global Traders HubX home"
        >
          <Logo />
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Admin sign in</CardTitle>
            <CardDescription>
              Operations access for Global Traders HubX staff.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminLoginForm />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-faint">
          Member?{" "}
          <Link href="/login" className="text-brand hover:underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
