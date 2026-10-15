/**
 * GTHubX — database seed (Phase 2).
 *
 * Idempotent: safe to run repeatedly (`pnpm db:seed`). Seeds only authoritative
 * reference data derivable from the plan and the engine:
 *   - the two bonus pools (RANK, LEADERSHIP) the engine accrues into;
 *   - site settings (identity, contact, compliance, social);
 *   - navigation (header + footer) from the public page inventory (PLAN §2).
 *
 * Deliberately NOT seeded here — these need Henry's business input, not invention:
 *   - Packages (non-custodial participation tiers), Brokers, Traders,
 *     Testimonials, FAQ / blog content.
 * Admin / User accounts are deferred to Phase 3 (auth + password hashing).
 */
import "dotenv/config";
import { Prisma, PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PROVISIONABLE_NAV } from "../lib/public-nav";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and configure it.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SITE_SETTINGS: Array<{ key: string; value: Prisma.InputJsonValue }> = [
  {
    key: "site.identity",
    value: {
      name: "Global Traders HubX",
      shortName: "GTHubX",
      tagline: "Connect. Copy. Trade. Grow.",
      domain: "gthubx.com",
    },
  },
  {
    key: "site.contact",
    value: {
      email: "hello@gthubx.com",
      supportEmail: "support@gthubx.com",
      phone: "",
      address: "",
    },
  },
  {
    key: "site.compliance",
    value: {
      riskNotice:
        "Trading involves substantial risk and is not suitable for every investor. " +
        "Past performance is not indicative of future results. Global Traders HubX is a " +
        "software and community platform: it does not hold client funds and does not " +
        "provide investment advice.",
      custodyDisclosure:
        "Global Traders HubX never takes custody of client funds. Copying is executed " +
        "manually on your own broker account.",
    },
  },
  {
    key: "site.social",
    value: { links: [] },
  },
];

const NAV_ITEMS = PROVISIONABLE_NAV;

async function main(): Promise<void> {
  // 1. Bonus pools — the engine accrues into these; they must exist.
  for (const kind of ["RANK", "LEADERSHIP"] as const) {
    await prisma.bonusPool.upsert({
      where: { kind },
      update: {},
      create: { kind },
    });
  }
  console.log("✓ bonus pools (RANK, LEADERSHIP)");

  // 2. Site settings.
  for (const setting of SITE_SETTINGS) {
    await prisma.siteSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
  }
  console.log(`✓ site settings (${SITE_SETTINGS.length})`);

  // 3. Navigation — provisioned from lib/public-nav.ts, the same module the
  //    navbar, the footer and the guard test read. The table is a mirror of
  //    that source, so it can never drift from what the site renders.
  for (const item of NAV_ITEMS) {
    await prisma.navigationItem.upsert({
      where: { id: item.id },
      update: {
        label: item.label,
        url: item.href,
        location: item.location,
        order: item.order,
      },
      create: {
        id: item.id,
        label: item.label,
        url: item.href,
        location: item.location,
        order: item.order,
      },
    });
  }
  console.log(`✓ navigation items (${NAV_ITEMS.length})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed complete.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
