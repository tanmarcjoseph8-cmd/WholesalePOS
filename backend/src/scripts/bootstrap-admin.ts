import { prisma } from "../config/prisma.js";
import { hashPassword } from "../modules/auth/password.service.js";

const ownerPermissions = [
  "dashboard.read",
  "users.manage",
  "roles.manage",
  "products.manage",
  "inventory.manage",
  "sales.manage",
  "sales.refund",
  "sales.void",
  "purchase-orders.manage",
  "customers.manage",
  "suppliers.manage",
  "reports.read",
  "settings.manage",
  "audit.read"
];

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME ?? "System Owner";
const storeName = process.env.STORE_NAME ?? "Main Store";

if (!email || !password || password.length < 12) {
  throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters before bootstrapping.");
}

const store = await prisma.store.upsert({
  where: { id: "default-store" },
  update: { name: storeName },
  create: {
    id: "default-store",
    name: storeName,
    currency: "PHP"
  }
});

await prisma.warehouse.upsert({
  where: { storeId_code: { storeId: store.id, code: "MAIN" } },
  update: { name: "Main Warehouse" },
  create: {
    storeId: store.id,
    code: "MAIN",
    name: "Main Warehouse"
  }
});

const role = await prisma.role.upsert({
  where: { name: "Owner" },
  update: { description: "Full system access for the business owner." },
  create: {
    name: "Owner",
    description: "Full system access for the business owner."
  }
});

for (const key of ownerPermissions) {
  const permission = await prisma.permission.upsert({
    where: { key },
    update: {},
    create: {
      key,
      description: key
        .split(".")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    }
  });

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId: role.id,
        permissionId: permission.id
      }
    },
    update: {},
    create: {
      roleId: role.id,
      permissionId: permission.id
    }
  });
}

const user = await prisma.user.upsert({
  where: { email },
  update: {
    name,
    roleId: role.id,
    storeId: store.id,
    isActive: true,
    status: "ACTIVE"
  },
  create: {
    email,
    name,
    roleId: role.id,
    storeId: store.id,
    passwordHash: await hashPassword(password),
    status: "ACTIVE"
  }
});

await prisma.auditLog.create({
  data: {
    actorId: user.id,
    action: "ADMIN_BOOTSTRAPPED",
    entityType: "User",
    entityId: user.id,
    metadata: { email }
  }
});

await prisma.$disconnect();
