import type { Request } from "express";
import { AppError } from "../../shared/app-error.js";
import { getRequestAuth } from "./auth.middleware.js";

export type Actor = {
  userId: string;
  storeId: string | null;
};

export function getActor(request: Request): Actor {
  const auth = getRequestAuth(request);
  if (!auth) {
    throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
  }

  return { userId: auth.userId, storeId: auth.storeId };
}
