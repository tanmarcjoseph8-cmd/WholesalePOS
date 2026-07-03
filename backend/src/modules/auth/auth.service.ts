import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { LoginRequest, LogoutRequest, RefreshTokenRequest, SetupOwnerRequest } from "./auth.schemas.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./token.service.js";

const refreshTokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const ownerPermissions = [
  "dashboard.read",
  "users.manage",
  "roles.manage",
  "products.manage",
  "inventory.manage",
  "sales.manage",
  "purchase-orders.manage",
  "customers.manage",
  "suppliers.manage",
  "reports.read",
  "settings.manage",
  "audit.read"
];

type TransactionClient = Prisma.TransactionClient;

async function ensureOwnerRole(client: TransactionClient = prisma) {
  const role = await client.role.upsert({
    where: { name: "Owner" },
    update: { description: "Full system access for the business owner." },
    create: {
      name: "Owner",
      description: "Full system access for the business owner."
    }
  });

  for (const key of ownerPermissions) {
    const permission = await client.permission.upsert({
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

    await client.rolePermission.upsert({
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

async function createSessionForUser(
  user: { id: string; roleId: string; storeId: string | null; name: string; email: string; role: { name: string } },
  input: { rememberMe: boolean },
  metadata: { ipAddress?: string; userAgent?: string }
) {
  const subject = { userId: user.id, roleId: user.roleId, storeId: user.storeId };
  const accessToken = signAccessToken(subject);
  const refreshToken = signRefreshToken(subject);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: refreshTokenHash(refreshToken),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
      expiresAt: new Date(Date.now() + (input.rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000)
    }
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      storeId: user.storeId
    }
  };
}

export async function getSetupStatus() {
  const userCount = await prisma.user.count({ where: { deletedAt: null } });
  return { requiresSetup: userCount === 0 };
}

export async function setupOwner(input: SetupOwnerRequest, metadata: { ipAddress?: string; userAgent?: string }) {
  const existingUsers = await prisma.user.count({ where: { deletedAt: null } });
  if (existingUsers > 0) {
    throw new AppError(409, "SETUP_ALREADY_COMPLETED", "The owner account has already been created.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (transaction) => {
    const store = await transaction.store.upsert({
      where: { id: "default-store" },
      update: { name: input.storeName },
      create: {
        id: "default-store",
        name: input.storeName,
        currency: "PHP"
      }
    });

    await transaction.warehouse.upsert({
      where: { storeId_code: { storeId: store.id, code: "MAIN" } },
      update: { name: "Main Warehouse" },
      create: {
        storeId: store.id,
        code: "MAIN",
        name: "Main Warehouse"
      }
    });

    const role = await ensureOwnerRole(transaction);
    const createdUser = await transaction.user.create({
      data: {
        email: input.email,
        name: input.name,
        roleId: role.id,
        storeId: store.id,
        passwordHash,
        status: "ACTIVE"
      },
      include: { role: true }
    });

    await transaction.auditLog.create({
      data: {
        actorId: createdUser.id,
        action: "OWNER_SETUP_COMPLETED",
        entityType: "User",
        entityId: createdUser.id,
        metadata: { email: createdUser.email, storeName: store.name }
      }
    });

    return createdUser;
  });

  return createSessionForUser(user, { rememberMe: true }, metadata);
}

export async function login(input: LoginRequest, metadata: { ipAddress?: string; userAgent?: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { role: true }
  });

  const passwordIsValid = user ? await verifyPassword(input.password, user.passwordHash) : false;

  await prisma.auditLog.create({
    data: {
      actorId: user?.id,
      action: passwordIsValid ? "AUTH_LOGIN_SUCCESS" : "AUTH_LOGIN_FAILED",
      entityType: "User",
      entityId: user?.id,
      metadata: {
        email: input.email,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent
      }
    }
  });

  if (!user || !passwordIsValid || user.deletedAt || !user.isActive || user.status !== "ACTIVE") {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  return createSessionForUser(user, input, metadata);
}

export async function refreshSession(input: RefreshTokenRequest, metadata: { ipAddress?: string; userAgent?: string }) {
  let subject: ReturnType<typeof verifyRefreshToken>;
  try {
    subject = verifyRefreshToken(input.refreshToken);
  } catch {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh token is invalid or expired.");
  }
  const existingTokenHash = refreshTokenHash(input.refreshToken);
  const existingSession = await prisma.session.findUnique({
    where: { refreshTokenHash: existingTokenHash },
    include: { user: { include: { role: true } } }
  });

  if (
    !existingSession ||
    existingSession.revokedAt ||
    existingSession.expiresAt <= new Date() ||
    existingSession.userId !== subject.userId ||
    existingSession.user.deletedAt ||
    !existingSession.user.isActive ||
    existingSession.user.status !== "ACTIVE"
  ) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "The refresh token is invalid or expired.");
  }

  const nextSubject = {
    userId: existingSession.user.id,
    roleId: existingSession.user.roleId,
    storeId: existingSession.user.storeId
  };
  const accessToken = signAccessToken(nextSubject);
  const refreshToken = signRefreshToken(nextSubject);

  await prisma.$transaction([
    prisma.session.update({
      where: { id: existingSession.id },
      data: { revokedAt: new Date() }
    }),
    prisma.session.create({
      data: {
        userId: existingSession.userId,
        refreshTokenHash: refreshTokenHash(refreshToken),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        expiresAt: existingSession.expiresAt
      }
    }),
    prisma.auditLog.create({
      data: {
        actorId: existingSession.userId,
        action: "AUTH_TOKEN_REFRESHED",
        entityType: "Session",
        entityId: existingSession.id,
        metadata: {
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        }
      }
    })
  ]);

  return {
    accessToken,
    refreshToken,
    user: {
      id: existingSession.user.id,
      name: existingSession.user.name,
      email: existingSession.user.email,
      role: existingSession.user.role.name,
      storeId: existingSession.user.storeId
    }
  };
}

export async function logout(input: LogoutRequest, metadata: { ipAddress?: string; userAgent?: string }) {
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: refreshTokenHash(input.refreshToken) }
  });

  if (!session || session.revokedAt) {
    return { success: true };
  }

  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    }),
    prisma.auditLog.create({
      data: {
        actorId: session.userId,
        action: "AUTH_LOGOUT",
        entityType: "Session",
        entityId: session.id,
        metadata: {
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent
        }
      }
    })
  ]);

  return { success: true };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true }
          }
        }
      }
    }
  });

  if (!user || user.deletedAt || !user.isActive || user.status !== "ACTIVE") {
    throw new AppError(401, "USER_NOT_ACTIVE", "The authenticated user is not active.");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
    storeId: user.storeId,
    permissions: user.role.permissions.map((entry: { permission: { key: string } }) => entry.permission.key)
  };
}
