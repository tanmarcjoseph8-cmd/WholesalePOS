import prismaClientPackage from "@prisma/client";

const { PrismaClient } = prismaClientPackage;

export const prisma = new PrismaClient({
  log: ["error", "warn"]
});
