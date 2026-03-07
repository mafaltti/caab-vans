import { z } from "zod/v4";

export const trackingSchema = z.object({
  deviceId: z.uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().nullable(),
  speed: z.number().nonnegative().nullable(),
  heading: z.number().min(0).max(360).nullable(),
  ts: z.int().positive(),
  bufferSize: z.int().nonnegative().nullable().optional(),
  failureCount: z.int().nonnegative().nullable().optional(),
  batteryLevel: z.number().min(0).max(1).nullable().optional(),
  networkType: z.enum(["wifi", "cellular", "none"]).nullable().optional(),
});

export const batchTrackingSchema = z.object({
  points: z.array(trackingSchema).min(1).max(100),
});
