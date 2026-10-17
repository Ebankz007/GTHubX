/**
 * GTHubX — rank-milestone FIXTURE (Phase 6b).
 *
 *   pnpm db:seed:rank-fixture
 *
 * DEV FIXTURE ONLY. Builds a sponsor tree in which a single registration
 * settlement produces every rank outcome at once, so the live smoke can
 * assert all of them deterministically:
 *
 *   A   qualifies Associate rank 1  -> pool covers it  -> PAID  ($14)
 *   S1  qualifies Leadership rank 1 -> SKU             -> PENDING (SMARTPHONE)
 *   S2  qualifies Associate rank 1  -> pool exhausted  -> FLAGGED ($14)
 *
 *   tree:  newcomer -> a1 -> A -> S1 -> S2
 *          A has 3 legs x 4 members            (3 refs, 15 team >= 12)
 *          S1 is seeded at Associate rank 3 with B/C/b1 also at rank 3
 *             across 2 legs                     (leadership gate)
 *          S2 has 5 legs, one dominant, capped   (eligible 16 >= 12)
 *          RANK pool seeded at 1800c; the settle
 *             accrues +400c = 2200c available,
 *             A takes 1400, 800 remains -> S2 short
 *
 * Non-negotiable behaviors:
 *   - Idempotent: wipes its OWN universe first (emails under
 *     `@rank-fixture.test` — cascade removes their payments, commissions,
 *     ledger entries and awards).
 *   - Resets the RANK pool to a known baseline. That overwrites dev-DB pool
 *     history, which is why this may never run against anything but a dev
 *     database: production pool ledgers are append-only, always.
 *   - The newcomer is created with a PENDING registration payment, mirroring
 *     `app/api/auth/register` exactly — the smoke confirms it through the
 *     real admin endpoint, so NO register API call is made (that route is
 *     rate-limited to 5/hour/IP and this fixture must be re-runnable).
 *
 * Imports are relative and the adapter is wired explicitly, matching
 * `prisma/seed-admin.ts` — `@/` path aliases are not reliably resolved under
 * tsx, and Prisma 7 requires a driver adapter.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/password";
import { PLATFORM_FEE_CENTS, REGISTRATION_GROSS_CENTS } from "../lib/engine";

const FIXTURE_DOMAIN = "@rank-fixture.test";
/** Funded pool baseline: 1800c covers A's 1400c but not S2's, on purpose. */
const RANK_POOL_BASELINE_CENTS = 1800;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and configure it.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  // ---- wipe this fixture's own universe (cascades) --------------------------
  const wiped = await prisma.user.deleteMany({
    where: { email: { endsWith: FIXTURE_DOMAIN } },
  });

  // ---- reset the RANK pool to a deterministic baseline (DEV ONLY) ----------
  await prisma.poolLedgerEntry.deleteMany({ where: { kind: "RANK" } });
  const pool = await prisma.bonusPool.upsert({
    where: { kind: "RANK" },
    create: { kind: "RANK", accruedCents: RANK_POOL_BASELINE_CENTS },
    update: { accruedCents: RANK_POOL_BASELINE_CENTS, paidCents: 0 },
    select: { accruedCents: true, paidCents: true },
  });

  // ---- build the tree ------------------------------------------------------
  const passwordHash = await hashPassword("Fixture-Pass-1");
  const ids = new Map<string, string>();

  const addUser = async (
    name: string,
    opts: { sponsor?: string; assocRank?: number; leadershipRank?: number } = {},
  ): Promise<string> => {
    const user = await prisma.user.create({
      data: {
        email: `${name}${FIXTURE_DOMAIN}`,
        passwordHash,
        fullName: `Rank Fixture ${name}`,
        country: "KE",
        sponsorId: opts.sponsor ? ids.get(opts.sponsor)! : null,
        status: "ACTIVE",
        isActiveMember: true,
        highestAssociateRank: opts.assocRank ?? 0,
        highestLeadershipRank: opts.leadershipRank ?? 0,
      },
    });
    await prisma.wallet.create({ data: { userId: user.id, balanceCents: 0 } });
    ids.set(name, user.id);
    return user.id;
  };

  await addUser("S2"); // root
  await addUser("S1", { sponsor: "S2", assocRank: 3 }); // seeded Associate 3
  for (const name of ["X", "Y", "Z", "W"]) await addUser(name, { sponsor: "S2" });

  await addUser("A", { sponsor: "S1" });
  await addUser("B", { sponsor: "S1", assocRank: 3 });
  await addUser("C", { sponsor: "S1", assocRank: 3 });

  for (const leg of ["a1", "a2", "a3"]) {
    await addUser(leg, { sponsor: "A" });
    for (let i = 1; i <= 4; i += 1) await addUser(`${leg}k${i}`, { sponsor: leg });
  }
  for (let i = 1; i <= 4; i += 1) {
    await addUser(`b${i}`, { sponsor: "B", assocRank: i === 1 ? 3 : 0 });
    await addUser(`c${i}`, { sponsor: "C" });
  }

  // The member whose settlement triggers evaluation of the whole chain above.
  const newcomerId = await addUser("newcomer", { sponsor: "a1" });
  const payment = await prisma.payment.create({
    data: {
      userId: newcomerId,
      purpose: "REGISTRATION",
      amountCents: REGISTRATION_GROSS_CENTS,
      platformFeeCents: PLATFORM_FEE_CENTS,
      currency: "USDT",
      status: "PENDING",
      paymentRef: `FIXTURE-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
    },
  });

  console.log(`FIXTURE_OK usersWiped=${wiped.count} pool=${pool.accruedCents}`);
  console.log(`NEWCOMER_PAYMENT=${payment.id}`);
  console.log(`NEWCOMER_USER=${newcomerId}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
