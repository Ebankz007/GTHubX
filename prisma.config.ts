// GTHubX — Prisma CLI configuration (Prisma 7)
//
// In Prisma 7 the datasource URL lives here, not in schema.prisma. `dotenv/config`
// loads `.env` so the CLI sees DATABASE_URL. `process.env[...]` (rather than
// `env(...)`) is used deliberately: it resolves to `undefined` instead of throwing
// when `.env` is absent, so `prisma generate` / `prisma validate` still work offline.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
