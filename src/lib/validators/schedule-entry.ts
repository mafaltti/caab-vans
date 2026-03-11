import { z } from "zod/v4";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createScheduleEntrySchema = z
  .object({
    stopName: z
      .string()
      .min(1, "Stop name is required")
      .max(200, "Stop name too long"),
    arrivalTime: z.string().regex(timePattern, "Arrival time must be in HH:mm format"),
    departureTime: z.string().regex(timePattern, "Departure time must be in HH:mm format"),
    stopLat: z.number().min(-90).max(90).nullable().optional(),
    stopLng: z.number().min(-180).max(180).nullable().optional(),
    stopGroupId: z.string().max(100).nullable().optional(),
  })
  .refine((d) => d.departureTime >= d.arrivalTime, {
    message: "Departure must not be before arrival",
    path: ["departureTime"],
  });

export const updateScheduleEntrySchema = z
  .object({
    stopName: z
      .string()
      .min(1, "Stop name is required")
      .max(200, "Stop name too long"),
    arrivalTime: z.string().regex(timePattern, "Arrival time must be in HH:mm format"),
    departureTime: z.string().regex(timePattern, "Departure time must be in HH:mm format"),
    stopLat: z.number().min(-90).max(90).nullable().optional(),
    stopLng: z.number().min(-180).max(180).nullable().optional(),
    stopGroupId: z.string().max(100).nullable().optional(),
  })
  .refine((d) => d.departureTime >= d.arrivalTime, {
    message: "Departure must not be before arrival",
    path: ["departureTime"],
  });

export const reorderScheduleEntriesSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1),
});
