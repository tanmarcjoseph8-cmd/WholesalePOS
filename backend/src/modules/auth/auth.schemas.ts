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

export type LoginRequest = z.infer<typeof loginSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
export type LogoutRequest = z.infer<typeof logoutSchema>;
