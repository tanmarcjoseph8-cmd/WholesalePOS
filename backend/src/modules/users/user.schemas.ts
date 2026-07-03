import { z } from "zod";

export const userRoleSchema = z.enum(["ADMINISTRATOR", "CASHIER"]);
export const userStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(12).max(256),
  role: userRoleSchema
});

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    status: userStatusSchema.optional(),
    role: userRoleSchema.optional(),
    password: z.string().min(12).max(256).optional()
  })
  .refine((input) => Object.keys(input).length > 0, "At least one field is required.");

export const userIdParamSchema = z.object({
  id: z.string().trim().min(1)
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type UserRoleInput = z.infer<typeof userRoleSchema>;
