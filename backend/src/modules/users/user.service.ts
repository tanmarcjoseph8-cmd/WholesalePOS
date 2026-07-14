import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { Actor } from "../auth/actor.js";
import { hashPassword } from "../auth/password.service.js";
import type { UserCreateInput, UserRoleInput, UserUpdateInput } from "./user.schemas.js";

const roleDefinitions: Record<UserRoleInput, { name: string; description: string; permissions: string[] }> = {
  ADMINISTRATOR: {
    name: "Administrator",
    description: "Can manage products, inventory, users, reports, settings, and backups.",
    permissions: [
      "dashboard.read",
      "users.manage",
      "products.manage",
      "inventory.manage",
      "sales.manage",
      "sales.refund",
      "sales.void",
      "customers.manage",
      "suppliers.manage",
      "reports.read",
      "settings.manage",
      "audit.read",
      "inventory.import",
      "inventory.import.rollback",
      "tables.manage",
      "orders.manage",
      "orders.cancel",
      "orders.split-bill",
      "orders.discount",
      "orders.reopen"
    ]
  },
  CASHIER: {
    name: "Cashier",
    description: "Can use the POS, search products, and serve customers.",
    permissions: ["dashboard.read", "sales.manage", "customers.manage", "orders.manage"]
  }
};

function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  status: string;
  isActive: boolean;
  createdAt: Date;
  role: { name: string };
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
    status: user.status,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString()
  };
}

async function ensureRole(roleInput: UserRoleInput) {
  const definition = roleDefinitions[roleInput];
  const role = await prisma.role.upsert({
    where: { name: definition.name },
    update: { description: definition.description },
    create: {
      name: definition.name,
      description: definition.description
    }
  });

  for (const key of definition.permissions) {
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

  return role;
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: { role: true },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }]
  });

  return users.map(toPublicUser);
}

export async function createUser(input: UserCreateInput, actor: Actor) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    throw new AppError(409, "USER_EMAIL_EXISTS", "A user with this email already exists.");
  }

  const role = await ensureRole(input.role);
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (transaction) => {
    const created = await transaction.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        roleId: role.id,
        storeId: actor.storeId,
        status: "ACTIVE",
        isActive: true
      },
      include: { role: true }
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: created.id,
        metadata: { email: created.email, role: created.role.name }
      }
    });

    return created;
  });

  return toPublicUser(user);
}

export async function updateUser(userId: string, input: UserUpdateInput, actor: Actor) {
  const existing = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, include: { role: true } });
  if (!existing) {
    throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
  }

  const role = input.role ? await ensureRole(input.role) : undefined;
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const user = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        status: input.status,
        isActive: input.status ? input.status === "ACTIVE" : undefined,
        roleId: role?.id,
        passwordHash
      },
      include: { role: true }
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: userId,
        metadata: { changedFields: Object.keys(input), previousRole: existing.role.name, nextRole: updated.role.name }
      }
    });

    return updated;
  });

  return toPublicUser(user);
}
