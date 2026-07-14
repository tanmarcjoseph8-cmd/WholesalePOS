import type { Prisma } from "@prisma/client";

export async function nextSequenceNumber(transaction: Prisma.TransactionClient, storeId: string, prefix: string) {
  const sequence = await transaction.receiptSequence.upsert({
    where: { storeId_prefix: { storeId, prefix } },
    update: { nextNumber: { increment: 1 } },
    create: { storeId, prefix, nextNumber: 2, padding: 6 }
  });

  return `${sequence.prefix}-${String(sequence.nextNumber - 1).padStart(sequence.padding, "0")}`;
}
