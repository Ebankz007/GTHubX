import { Repeat2, Layers, Network, MessagesSquare } from "lucide-react";
import { Reveal } from "@/components/site/reveal";

const PILLARS = [
  {
    icon: Repeat2,
    key: "Copy",
    promise: "Follow. Learn. Trade.",
    body: "Follow selected traders and participate alongside experienced market participants through supported copy-trading technology.",
  },
  {
    icon: Layers,
    key: "Invest",
    promise: "Choose. Participate. Grow.",
    body: "Explore structured participation options designed around different levels and objectives, with clear terms and transparency.",
  },
  {
    icon: Network,
    key: "Network",
    promise: "Connect. Refer. Build.",
    body: "Build a referral network and benefit from eligible community growth — rewarding those who grow the hub with you.",
  },
  {
    icon: MessagesSquare,
    key: "Community",
    promise: "Learn. Share. Improve.",
    body: "Learn alongside other traders through education, market discussions, insights, events, and a global member community.",
  },
];

export function Pillars() {
  return (
    <section className="relative py-20 sm:py-28" id="pillars">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="font-display text-sm font-semibold uppercase tracking-wider text-brand">
            The Four Pillars
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            One platform. Multiple opportunities.
          </h2>
          <p className="mt-4 text-muted">
            Global Traders HubX brings copy trading, structured participation,
            referral networking, and a trader community together into one
            connected ecosystem.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <Reveal key={p.key} delay={i * 70}>
              <article className="card card-hover h-full p-6">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand/12 text-brand">
                  <p.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
                  {p.key}
                </h3>
                <p className="mt-1 text-sm font-medium text-emerald-bright">
                  {p.promise}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted">{p.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
