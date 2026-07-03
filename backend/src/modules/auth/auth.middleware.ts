import type { Request, RequestHandler } from "express";
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
