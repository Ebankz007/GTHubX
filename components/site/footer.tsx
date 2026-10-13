import Link from "next/link";
import { Logo } from "./logo";

const PLATFORM = [
  { label: "Copy Trading", href: "/copy-trading" },
  { label: "Investment Packages", href: "/packages" },
  { label: "Traders", href: "/traders" },
  { label: "Referral Network", href: "/network" },
  { label: "Community", href: "/community" },
  { label: "Education", href: "/education" },
];

const COMPANY = [
  { label: "About Us", href: "/about" },
  { label: "Contact", href: "/contact" },
  { label: "FAQ", href: "/faq" },
  { label: "Blog", href: "/blog" },
  { label: "Login", href: "/login" },
  { label: "Join Now", href: "/register" },
];

const LEGAL = [
  { label: "Risk Disclosure", href: "/legal/risk-disclosure" },
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Cookie Policy", href: "/legal/cookies" },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              A global community for traders and investors — copy trading,
              structured participation, referral networking, and education in one
              hub.
            </p>
            <p className="mt-4 font-display text-sm font-semibold text-brand">
              Connect. Copy. Trade. Grow.
            </p>
          </div>

          <FooterColumn title="Platform" links={PLATFORM} />
          <FooterColumn title="Company" links={COMPANY} />
          <FooterColumn title="Legal" links={LEGAL} />
        </div>

        <div className="mt-12 rounded-xl border border-border bg-card p-4">
          <p className="text-xs leading-relaxed text-faint">
            <span className="font-semibold text-muted">Risk notice.</span> Trading
            and investing involve substantial risk and may not be suitable for all
            participants. Past performance is not indicative of future results. No
            content on this platform constitutes financial advice or a guarantee of
            returns. Participation is at your own risk. Global Traders HubX is a
            technology and community platform and does not provide investment,
            legal, or tax advice.
          </p>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-faint sm:flex-row">
          <p>© {year} Global Traders HubX. All rights reserved.</p>
          <p>Built for traders. Powered by community.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-brand"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
