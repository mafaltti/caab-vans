import { z } from "zod/v4";

export const createAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  body: z.string().min(1, "Body is required").max(2000, "Body too long"),
  isPinned: z.boolean().optional().default(false),
  isUrgent: z.boolean().optional().default(false),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const updateAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  body: z.string().min(1, "Body is required").max(2000, "Body too long"),
  isPinned: z.boolean().optional(),
  isUrgent: z.boolean().optional(),
  expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
});
