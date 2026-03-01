import { z } from "zod/v4";

export const trackingSchema = z.object({
  deviceId: z.uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().nullable(),
  speed: z.number().nonnegative().nullable(),
  heading: z.number().min(0).max(360).nullable(),
  ts: z.int().positive(),
});
