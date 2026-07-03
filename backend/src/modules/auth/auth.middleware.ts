import type { Request, RequestHandler } from "express";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import { type TokenSubject, verifyAccessToken } from "./token.service.js";

export type RequestWithAuth = Request & {
  auth?: TokenSubject;
};

export function getRequestAuth(request: Request) {
  return (request as RequestWithAuth).auth;
}

export const requireAuth: RequestHandler = (request, _response, next) => {
  const authorization = request.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError(401, "AUTHENTICATION_REQUIRED", "A valid bearer token is required."));
    return;
  }

  try {
    (request as RequestWithAuth).auth = verifyAccessToken(authorization.slice("Bearer ".length));
    next();
  } catch {
    next(new AppError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired."));
  }
};

export function requirePermission(permissionKey: string): RequestHandler {
  return async (request, _response, next) => {
    try {
      const auth = getRequestAuth(request);
      if (!auth) {
        next(new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required."));
        return;
      }

      const allowed = await prisma.rolePermission.findFirst({
        where: {
          roleId: auth.roleId,
          permission: { key: permissionKey }
        },
        select: { roleId: true }
      });

      if (!allowed) {
        next(new AppError(403, "PERMISSION_DENIED", "You do not have permission to perform this action."));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
