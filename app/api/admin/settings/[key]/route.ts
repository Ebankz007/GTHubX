import { getCurrentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { isAllowedSettingKey, MAX_SETTING_JSON_CHARS } from "@/lib/site-settings";

/**
 * Update one site setting.
 *
 * Three independent gates, on purpose:
 *   1. signed in as an admin,
 *   2. role holds `settings`,
 *   3. the key is on the allowlist — an unknown key is a 404, not a write.
 *
 * The page behind this is guarded too, but a UI gate is a convenience, not a
 * boundary. Every successful save writes an audit row with the before/after
 * value, because these values are public-facing copy — including the risk and
 * custody disclosures.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const actor = await getCurrentAdmin();
  if (!actor) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(actor.role, "settings")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { key } = await params;
  if (!isAllowedSettingKey(key)) {
    return Response.json({ error: "Setting not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const value =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as { value?: unknown }).value
      : undefined;

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return Response.json(
      { error: "A setting value must be a JSON object." },
      { status: 400 },
    );
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return Response.json({ error: "Value is not serialisable." }, { status: 400 });
  }

  if (serialized.length > MAX_SETTING_JSON_CHARS) {
    return Response.json(
      { error: "That setting is too large." },
      { status: 400 },
    );
  }

  const existing = await prisma.siteSetting.findUnique({ where: { key } });
  if (!existing) {
    // Allowlisted but not seeded — refuse rather than invent a record the rest
    // of the site does not expect to read.
    return Response.json({ error: "Setting not found" }, { status: 404 });
  }

  const before = existing.value;

  await prisma.siteSetting.update({
    where: { key },
    data: { value: value as object },
  });

  await recordAudit({
    adminId: actor.id,
    action: "site.setting-update",
    entity: "SiteSetting",
    entityId: key,
    before: before as object,
    after: value as object,
    ip: clientIp(request),
  });

  return Response.json({ ok: true, key });
}
