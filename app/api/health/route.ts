/**
 * GTHubX — health endpoint.
 *
 * The deploy pipeline's contract: 200 only when the app can reach the
 * database; 503 otherwise. `infrastructure/deploy/deploy.sh` gates every
 * deployment on this endpoint, and the panel's 2-minute auto-deploy cron
 * re-checks it when idle.
 *
 * force-dynamic: never prerendered at build time — the deploy gate checks
 * the LIVE database, and a build-time DB probe would only add a way for
 * CI to fail for a reason that says nothing about production.
 */
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Bound the probe so a hung database answers "down" in seconds, not minutes. */
const DB_TIMEOUT_MS = 3000;

export async function GET() {
  let db: "up" | "down" = "down";
  try {
    const probe = prisma.$queryRaw`SELECT 1`;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("db probe timeout")), DB_TIMEOUT_MS),
    );
    await Promise.race([probe, timeout]);
    db = "up";
  } catch {
    db = "down";
  }

  return Response.json(
    {
      status: db === "up" ? "ok" : "degraded",
      db,
      uptime_s: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
    {
      status: db === "up" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
