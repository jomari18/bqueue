import { sha256Hex } from "../auth/tokens.js";
import type { PrismaService } from "../prisma/prisma.service.js";

/** A kiosk ticket's tracker page proves itself with the token from its QR code; only the hash is stored. */
export async function findTicketByTrackingToken(
  db: PrismaService,
  token: string,
): Promise<{ ticketId: string; barangayId: string; expiresAt: Date } | null> {
  const ticket = await db.queueTicket.findUnique({
    where: { trackingTokenHash: sha256Hex(token) },
    select: { id: true, barangayId: true, barangay: { select: { expiresAt: true } } },
  });
  return ticket ? { ticketId: ticket.id, barangayId: ticket.barangayId, expiresAt: ticket.barangay.expiresAt } : null;
}
