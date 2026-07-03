import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { LoginRequest, LogoutRequest, RefreshTokenRequest } from "./auth.schemas.js";
import { verifyPassword } from "./password.service.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./token.service.js";

const refreshTokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

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
