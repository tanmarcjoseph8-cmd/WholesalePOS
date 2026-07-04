/* global console, process */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toNumber(value) {
  return Number(value);
}

async function main() {
  const actor = await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true } });
  const stocks = await prisma.inventoryStock.findMany({
    include: {
      product: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true } }
    }
  });
  const nonZeroStocks = stocks.filter((stock) => toNumber(stock.quantity) !== 0);

  if (nonZeroStocks.length === 0) {
    console.log("No stock balances needed clearing.");
    return;
  }

  await prisma.$transaction(async (transaction) => {
    for (const stock of nonZeroStocks) {
      const currentQuantity = toNumber(stock.quantity);
      await transaction.inventoryMovement.create({
        data: {
          productId: stock.productId,
          warehouseId: stock.warehouseId,
          type: "ADJUSTMENT",
          quantity: -currentQuantity,
          reason: "Stock cleared by owner request",
          createdByUserId: actor?.id
        }
      });
      await transaction.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: 0 }
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: actor?.id,
        action: "INVENTORY_STOCK_CLEARED",
        entityType: "InventoryStock",
        entityId: null,
        metadata: {
          clearedRows: nonZeroStocks.length,
          products: nonZeroStocks.map((stock) => ({
            productId: stock.productId,
            productName: stock.product.name,
            warehouseId: stock.warehouseId,
            warehouseName: stock.warehouse.name,
            previousQuantity: toNumber(stock.quantity)
          }))
        }
      }
    });
  });

  console.log(`Cleared ${nonZeroStocks.length} stock balance${nonZeroStocks.length === 1 ? "" : "s"}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
