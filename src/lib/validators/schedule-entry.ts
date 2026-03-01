import { z } from "zod/v4";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createScheduleEntrySchema = z.object({
  stopName: z
    .string()
    .min(1, "Stop name is required")
    .max(200, "Stop name too long"),
  time: z.string().regex(timePattern, "Time must be in HH:mm format"),
  stopLat: z.number().min(-90).max(90).nullable().optional(),
  stopLng: z.number().min(-180).max(180).nullable().optional(),
});

export const updateScheduleEntrySchema = z.object({
  stopName: z
    .string()
    .min(1, "Stop name is required")
    .max(200, "Stop name too long"),
  time: z.string().regex(timePattern, "Time must be in HH:mm format"),
  stopLat: z.number().min(-90).max(90).nullable().optional(),
  stopLng: z.number().min(-180).max(180).nullable().optional(),
});
