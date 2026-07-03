import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export type TokenSubject = {
  userId: string;
  roleId: string;
  storeId: string | null;
};

export function signAccessToken(subject: TokenSubject) {
  return jwt.sign(subject, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: "wholesalepos",
    audience: "wholesalepos-api"
  });
}

export function signRefreshToken(subject: TokenSubject) {
  return jwt.sign(subject, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL,
    issuer: "wholesalepos",
    audience: "wholesalepos-api"
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "wholesalepos",
    audience: "wholesalepos-api"
  }) as TokenSubject;
}
