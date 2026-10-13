import { ArrowRight, TrendingUp, Users, Globe2, BookOpen } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/site/reveal";

const HIGHLIGHTS = [
  { icon: TrendingUp, label: "Copy Trading" },
  { icon: Globe2, label: "Global Network" },
  { icon: Users, label: "Community" },
  { icon: BookOpen, label: "Education" },
];

export function Hero() {
  return (
    <section className="glow-brand relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="grid-lines pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 text-xs font-medium text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse-brand" />
              Global Trading &amp; Investment Community
            </span>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              <span className="text-gradient-brand">Connect. Copy.</span>
              <br />
              Trade. Grow.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              A global community for traders and investors. Access copy trading,
              structured participation, referral opportunities, and a growing
              network of traders — all from one platform.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/register" size="lg">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/about" size="lg" variant="secondary">
                Explore the Platform
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-2 text-sm text-faint">
                  <Icon className="h-4 w-4 text-brand" />
                  {label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={160} className="lg:pl-4">
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}

function HeroVisual() {
  const pillars = [
    { key: "COPY", promise: "Follow. Learn. Trade.", tone: "brand" as const },
    { key: "INVEST", promise: "Choose. Participate. Grow.", tone: "emerald" as const },
    { key: "NETWORK", promise: "Connect. Refer. Build.", tone: "brand" as const },
    { key: "COMMUNITY", promise: "Learn. Share. Improve.", tone: "emerald" as const },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md">
      <div className="card border-brand-gradient p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-faint">One Hub</p>
            <p className="font-display text-lg font-semibold">Global Opportunities</p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/12 text-brand">
            <Globe2 className="h-5 w-5" />
          </span>
        </div>
        <div className="divider-brand my-5" />
        <div className="grid grid-cols-2 gap-3">
          {pillars.map((p) => (
            <div
              key={p.key}
              className="rounded-xl border border-border bg-elevated/60 p-3.5"
            >
              <p
                className={
                  p.tone === "brand"
                    ? "font-display text-sm font-bold text-brand"
                    : "font-display text-sm font-bold text-emerald-bright"
                }
              >
                {p.key}
              </p>
              <p className="mt-1 text-xs leading-snug text-muted">{p.promise}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="animate-float card absolute -bottom-6 -left-6 hidden w-44 p-4 sm:block">
        <p className="text-xs text-faint">Community</p>
        <p className="mt-1 font-display text-sm font-semibold">
          Trade Together.
          <br />
          <span className="text-brand">Grow Together.</span>
        </p>
      </div>
    </div>
  );
}
