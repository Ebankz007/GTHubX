import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createTicketSchema, firstError } from "@/lib/validators";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/support — open a ticket with a seeded first message.
 *
 * The ticket and its opening message are written in one transaction: a ticket
 * with no body would render as an empty thread and be useless to the agent
 * who picks it up.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const rl = rateLimit(`support:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.ok) {
    return Response.json(
      { error: "Too many tickets. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }

  const { subject, category, priority, body: message } = parsed.data;

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        userId: user.id,
        subject,
        category: category || "GENERAL",
        priority,
      },
    });
    await tx.supportMessage.create({
      data: {
        ticketId: created.id,
        authorId: user.id,
        authorRole: "MEMBER",
        body: message,
      },
    });
    return created;
  });

  return Response.json(
    { ok: true, id: ticket.id, message: "Ticket opened." },
    { status: 201 },
  );
}
