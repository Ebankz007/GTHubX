import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/tokens";
import { hasPermission, type Permission } from "@/lib/rbac";
import type {
  AdminRole,
  KycStatus,
  UserRole,
  UserStatus,
} from "@/lib/generated/prisma/enums";

export const USER_SESSION_COOKIE = "gthubx_session";
export const ADMIN_SESSION_COOKIE = "gthubx_admin";

/** 7 days. Sliding renewal is a deliberate later refinement. */
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const isProd = process.env.NODE_ENV === "production";

export type SessionMeta = { ip?: string | null; userAgent?: string | null };

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  kycStatus: KycStatus;
  /** The member who referred this account, if any. Drives the network view. */
  sponsorId: string | null;
  emailVerifiedAt: Date | null;
  twoFactorEnabled: boolean;
};

export type SessionAdmin = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
};

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Extract client IP + user agent from a request, for the session audit trail. */
export function sessionMeta(request: Request): SessionMeta {
  const h = request.headers;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  return { ip, userAgent: h.get("user-agent") ?? null };
}

/* ------------------------------------------------------------ create ------ */

export async function createUserSession(
  userId: string,
  meta: SessionMeta = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      purpose: "SESSION",
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function createAdminSession(
  adminId: string,
  meta: SessionMeta = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash: hashToken(token),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/* ------------------------------------------------------------- cookies ---- */

export async function setUserSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(USER_SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function setAdminSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(ADMIN_SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export async function clearUserSessionCookie() {
  (await cookies()).delete(USER_SESSION_COOKIE);
}

export async function clearAdminSessionCookie() {
  (await cookies()).delete(ADMIN_SESSION_COOKIE);
}

/* ---------------------------------------------------------------- read ---- */

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(USER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.purpose !== "SESSION") return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const u = session.user;
  if (u.status === "SUSPENDED") return null;

  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    status: u.status,
    kycStatus: u.kycStatus,
    sponsorId: u.sponsorId,
    emailVerifiedAt: u.emailVerifiedAt,
    twoFactorEnabled: u.twoFactorEnabled,
  };
}

export async function getCurrentAdmin(): Promise<SessionAdmin | null> {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });
  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const a = session.admin;
  if (!a.isActive) return null;

  return { id: a.id, email: a.email, name: a.name, role: a.role };
}

/* -------------------------------------------------------------- guards ---- */

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/**
 * Guard an admin page/action by permission. A denial is loud (`?error=forbidden`)
 * so the user can tell "no access" from "broken".
 */
export async function requireAdminPermission(
  permission: Permission,
): Promise<SessionAdmin> {
  const admin = await requireAdmin();
  if (!hasPermission(admin.role, permission)) {
    redirect("/admin?error=forbidden");
  }
  return admin;
}

/* ------------------------------------------------------------- revoke ----- */

export async function revokeUserSessionByToken(token: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAdminSessionByToken(token: string): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutUser(): Promise<void> {
  const store = await cookies();
  const token = store.get(USER_SESSION_COOKIE)?.value;
  if (token) await revokeUserSessionByToken(token);
  store.delete(USER_SESSION_COOKIE);
}

export async function logoutAdmin(): Promise<void> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) await revokeAdminSessionByToken(token);
  store.delete(ADMIN_SESSION_COOKIE);
}
