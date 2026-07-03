import prismaClientPackage from "@prisma/client";
import { env } from "./env.js";

const { PrismaClient } = prismaClientPackage;

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL
    }
  },
  log: ["error", "warn"]
});
