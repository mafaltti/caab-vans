import { z } from "zod/v4";

export const ingestionSchema = z.object({
  message: z.string().min(1, "Message is required"),
});
