/**
 * GTHubX — identity retention (Phase 7d).
 *
 *   pnpm db:purge:identity --dry-run     # report what would be cleared
 *   pnpm db:purge:identity               # clear it
 *
 * The platform keeps a member's identity *details* for
 * `IDENTITY_RETENTION_DAYS` (see `lib/kyc/policy.ts`), counted from the moment
 * the submission was decided — or from submission, if no reviewer ever decided
 * it. After that window the details are cleared and the verdict stays.
 *
 * ---------------------------------------------------------------------------
 * Why the verdict outlives the evidence.
 *
 * "This member's identity was verified on 4 May 2026 by reviewer X" is a fact
 * the platform may need to state for years: it is what the withdrawal gate
 * rested on, and it is what an auditor or a regulator would ask for. The name,
 * birth date, address and document reference that supported that decision are
 * not — they were needed to make the decision, and the decision has been made.
 *
 * So this script is narrow on purpose. It nulls the identity columns and
 * touches nothing else: not `status`, not `submittedAt`, not `reviewedAt`, not
 * `reviewedById`, not `rejectionReason`. A member's verification history
 * survives; their personal data does not.
 *
 * ---------------------------------------------------------------------------
 * What it never does.
 *
 * It does not print the values it is removing. A retention job that logs the
 * data it deleted has moved the data, not deleted it — and a cron transcript is
 * a much less protected place than the database. It reports identifiers and
 * counts only.
 *
 * It also does not touch the `User` row, the audit trail, or any financial
 * record. The `KycProfile` is the only place identity details live.
 * ---------------------------------------------------------------------------
 */
import "dotenv/config";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  IDENTITY_FIELDS,
  IDENTITY_RETENTION_DAYS,
  identityPurgeCutoff,
} from "../lib/kyc/policy";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — cannot run the retention job.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const dryRun = process.argv.includes("--dry-run");

/** Every identity column, so the purge list and the null-out cannot drift. */
const identityData = Object.fromEntries(
  IDENTITY_FIELDS.map((field) => [field, null]),
);

/** "at least one identity field is still held" — so the report is about work. */
const stillHolding = {
  OR: IDENTITY_FIELDS.map((field) => ({ [field]: { not: null } })),
};

async function main() {
  const now = new Date();
  const cutoff = identityPurgeCutoff(now);

  // COALESCE(reviewedAt, submittedAt) < cutoff, expressed for Prisma.
  const due = await prisma.kycProfile.findMany({
    where: {
      AND: [
        stillHolding,
        {
          OR: [
            { reviewedAt: { lt: cutoff } },
            { reviewedAt: null, submittedAt: { lt: cutoff } },
          ],
        },
      ],
    },
    select: { id: true, status: true, reviewedAt: true, submittedAt: true },
  });

  console.log(
    `[retention] window ${IDENTITY_RETENTION_DAYS} days · cutoff ${cutoff.toISOString()}`,
  );

  if (due.length === 0) {
    console.log("[retention] nothing due. No identity details past the window.");
    return;
  }

  for (const row of due) {
    // Identifiers and dates only — never the details being removed.
    console.log(
      `[retention] ${dryRun ? "would clear" : "clearing"} ${row.id} ` +
        `(status=${row.status}, decided=${(row.reviewedAt ?? row.submittedAt)?.toISOString() ?? "never"})`,
    );
  }

  if (dryRun) {
    console.log(`[retention] DRY RUN — ${due.length} row(s) would be cleared.`);
    return;
  }

  const cleared = await prisma.kycProfile.updateMany({
    where: { id: { in: due.map((row) => row.id) } },
    data: identityData,
  });

  console.log(
    `[retention] cleared identity details on ${cleared.count} row(s). ` +
      `Verdicts, dates and reviewers untouched.`,
  );
}

main()
  .catch((error) => {
    console.error("[retention] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
