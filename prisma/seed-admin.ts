/**
 * GTHubX — admin bootstrap (Phase 5).
 *
 *   pnpm db:seed:admin
 *
 * Creates the first (or an additional) admin account. Credentials come from
 * `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_ROLE` / `ADMIN_PASSWORD`. If
 * `ADMIN_PASSWORD` is absent a strong one is generated and printed **once** —
 * never written to disk, never logged again. Change it after first sign-in.
 *
 * Idempotent: an existing email is left untouched and its password is NOT
 * reset, so re-running cannot lock anyone out.
 *
 * Imports are relative and the Prisma adapter is wired explicitly, matching
 * `prisma/seed.ts` — `@/` path aliases are not reliably resolved under tsx,
 * and Prisma 7 requires a driver adapter.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../lib/password";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and configure it.",
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const VALID_ROLES = [
  "SUPER_ADMIN",
  "CONTENT_ADMIN",
  "SUPPORT_ADMIN",
  "FINANCE_ADMIN",
  "NETWORK_ADMIN",
  "TRADER_ADMIN",
] as const;

/** 24 bytes → 32 base64url chars, well inside bcrypt's 72-byte limit. */
function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME ?? "").trim() || "Platform Admin";
  const roleRaw = (process.env.ADMIN_ROLE ?? "SUPER_ADMIN").trim().toUpperCase();
  const providedPassword = process.env.ADMIN_PASSWORD;
  const password = providedPassword ?? generatePassword();

  if (!email) {
    console.error(
      "ADMIN_EMAIL is required.\n" +
        '  $env:ADMIN_EMAIL = "you@example.com"; pnpm db:seed:admin\n' +
        "  optional: ADMIN_NAME, ADMIN_ROLE, ADMIN_PASSWORD",
    );
    process.exitCode = 1;
    return;
  }

  const role = (VALID_ROLES as readonly string[]).includes(roleRaw)
    ? (roleRaw as (typeof VALID_ROLES)[number])
    : "SUPER_ADMIN";
  if (role !== roleRaw) {
    console.warn(`Unknown ADMIN_ROLE "${roleRaw}" — defaulting to SUPER_ADMIN.`);
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(
      `Admin ${email} already exists (role ${existing.role}, active=${existing.isActive}).\n` +
        "Nothing was changed and the password was NOT reset.",
    );
    return;
  }

  const created = await prisma.admin.create({
    data: {
      email,
      name,
      role,
      isActive: true,
      passwordHash: await hashPassword(password),
    },
  });

  console.log(`Created ${created.role} admin: ${created.email} (${created.name})`);
  if (!providedPassword) {
    console.log(
      "\nA password was generated for you. It is shown ONCE and not stored:\n" +
        `\n  ${password}\n` +
        "\nSign in at /admin/login and change it immediately.",
    );
  } else {
    console.log("\nSign in at /admin/login.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
