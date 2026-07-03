import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { LoginRequest } from "./auth.schemas.js";
import { verifyPassword } from "./password.service.js";
import { signAccessToken, signRefreshToken } from "./token.service.js";

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

  if (!user || !passwordIsValid || user.deletedAt || !user.isActive) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  const subject = { userId: user.id, roleId: user.roleId, storeId: user.storeId };
  const accessToken = signAccessToken(subject);
  const refreshToken = signRefreshToken(subject);
  const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
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
