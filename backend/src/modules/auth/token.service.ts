import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";

export type TokenSubject = {
  userId: string;
  roleId: string;
  storeId: string | null;
};

export function signAccessToken(subject: TokenSubject) {
  const options: SignOptions = {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: "wholesalepos",
    audience: "wholesalepos-api"
  };

  return jwt.sign(subject, env.JWT_ACCESS_SECRET, {
    ...options
  });
}

export function signRefreshToken(subject: TokenSubject) {
  const options: SignOptions = {
    expiresIn: env.REFRESH_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: "wholesalepos",
    audience: "wholesalepos-api"
  };

  return jwt.sign(subject, env.JWT_REFRESH_SECRET, {
    ...options
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "wholesalepos",
    audience: "wholesalepos-api"
  }) as TokenSubject;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: "wholesalepos",
    audience: "wholesalepos-api"
  }) as TokenSubject;
}
