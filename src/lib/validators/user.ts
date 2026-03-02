import { z } from "zod/v4";

export const createUserSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "superuser", "driver"]),
});

export const updateUserSchema = z.object({
  role: z.enum(["admin", "superuser", "driver"]).optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional(),
  isActive: z.boolean().optional(),
});
