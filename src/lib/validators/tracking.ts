import { z } from "zod/v4";

const geofenceEventSchema = z.object({
  placeId: z.string(),
  enteredAt: z.int().positive(),
  eventId: z.uuid(),
});

export type GeofenceEventPayload = z.infer<typeof geofenceEventSchema>;

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
  geofenceEvents: z.array(geofenceEventSchema).optional(),
});

export const batchTrackingSchema = z.object({
  points: z.array(trackingSchema).min(1).max(100),
});
