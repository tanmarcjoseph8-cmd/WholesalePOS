import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(256),
  rememberMe: z.boolean().default(false)
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(32)
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(32)
});

export const verifyPasswordSchema = z.object({
  password: z.string().min(1).max(256)
});

export const setupOwnerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(12).max(256),
  storeName: z.string().trim().min(2).max(120).default("Main Store")
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
export type LogoutRequest = z.infer<typeof logoutSchema>;
export type SetupOwnerRequest = z.infer<typeof setupOwnerSchema>;
export type VerifyPasswordRequest = z.infer<typeof verifyPasswordSchema>;
