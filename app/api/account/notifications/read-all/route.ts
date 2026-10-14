import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** POST /api/account/notifications/read-all — clear the unread badge. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return Response.json({ ok: true, updated: result.count });
}
