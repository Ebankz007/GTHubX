import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createMessageSchema, firstError } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/support/[id]/messages — reply to a ticket you own.
 *
 * Ownership is checked against the *ticket*, not the message: a member may
 * never write into someone else's thread even with a valid ticket id.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;

  const rl = rateLimit(`support-msg:${user.id}`, 30, 60 * 60 * 1000);
  if (!rl.ok) {
    return Response.json(
      { error: "Too many replies. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createMessageSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });
  // Same response for "does not exist" and "not yours" — a 404/403 split
  // would confirm which ticket ids are real to an attacker.
  if (!ticket || ticket.userId !== user.id) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
    return Response.json(
      { error: "This ticket is closed and can no longer be replied to." },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        authorId: user.id,
        authorRole: "MEMBER",
        body: parsed.data.body,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  return Response.json({ ok: true, message: "Reply sent." }, { status: 201 });
}
