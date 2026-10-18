/**
 * GTHubX — payout FIXTURE (Phase 6c).
 *
 *   pnpm db:seed:payout-fixture
 *
 * DEV FIXTURE ONLY. Creates one member with a known wallet balance and a
 * real login (email verified), so the payout smoke can drive the actual
 * member login → request → admin review loop end to end without touching
 * the register route (5/hour/IP) or depending on any other fixture.
 *
 *   payout@payout-fixture.test / Fixture-Pass-1
 *   wallet: 2000c seeded — DEV ONLY. Production wallets are opened at 0 by
 *   registration and only credited through settlement; this overwrites that
 *   invariant and must never run outside a dev database.
 *
 * The member is seeded **identity-verified**, because since Phase 7c
 * `requestPayout` refuses anyone who is not: the fixture exists to exercise the
 * payout rail, so it has to satisfy the platform's own precondition. Seeding
 * that here — rather than having the smoke reach around the gate with SQL — is
 * the difference between testing the real rail and testing a bypass of it.
 *
 * Idempotent: wipes its OWN universe first (emails under
 * `@payout-fixture.test` — cascade removes their payouts, ledger entries
 * and sessions), then recreates it. The rank fixture (`@rank-fixture.test`)
 * is a separate universe and is untouched; neither fixture's assertions
 * depend on the other.
 *
 * Imports are relative and the adapter is wired explicitly, matching
 * `prisma/seed-admin.ts` — `@/` path aliases are not reliably resolved under
 * tsx, and Prisma 7 requires a driver adapter.
 */
import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/password";

const FIXTURE_DOMAIN = "@payout-fixture.test";
const MEMBER_EMAIL = `payout${FIXTURE_DOMAIN}`;
const MEMBER_PASSWORD = "Fixture-Pass-1";
/** Seeded balance: enough for the smoke's happy paths (1000 hold, 800, 400). */
const SEED_BALANCE_CENTS = 2000;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and configure it.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const wiped = await prisma.user.deleteMany({
    where: { email: { endsWith: FIXTURE_DOMAIN } },
  });

  const passwordHash = await hashPassword(MEMBER_PASSWORD);
  const user = await prisma.user.create({
    data: {
      email: MEMBER_EMAIL,
      passwordHash,
      fullName: "Payout Fixture Member",
      country: "KE",
      status: "ACTIVE",
      isActiveMember: true,
      emailVerifiedAt: new Date(),
      // The payout gate (Phase 7c) reads this field, and the profile below is
      // what a reviewer would have produced — so the fixture looks like a real
      // verified member, not like a member with a flag flipped behind the gate.
      kycStatus: "VERIFIED",
      kycProfile: {
        create: {
          status: "VERIFIED",
          legalName: "Payout Fixture Member",
          country: "KE",
          address: "Fixture House, Nairobi, Kenya",
          idType: "NATIONAL_ID",
          idNumber: "FIXTURE-0001",
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      },
    },
  });

  const wallet = await prisma.wallet.create({
    data: { userId: user.id, balanceCents: SEED_BALANCE_CENTS },
    select: { balanceCents: true },
  });

  console.log(`PAYOUT_FIXTURE_OK usersWiped=${wiped.count} wallet=${wallet.balanceCents}`);
  console.log(`PAYOUT_MEMBER_EMAIL=${MEMBER_EMAIL}`);
  console.log(`PAYOUT_MEMBER_PASSWORD=${MEMBER_PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
