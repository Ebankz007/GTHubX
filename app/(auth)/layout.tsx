import Link from "next/link";
import { Logo } from "@/components/site/logo";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
        {children}
      </div>

      <p className="relative z-10 mt-8 max-w-md text-center text-xs leading-relaxed text-faint">
        Trading involves risk, including possible loss of capital. Global Traders
        HubX is a community platform — not a broker, fund manager, or investment
        advisor.
      </p>
    </div>
  );
}
