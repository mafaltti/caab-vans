import { z } from "zod/v4";

export const createRouteSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  vanId: z.uuid("Invalid van ID"),
  driverIds: z.array(z.string().uuid()).optional(),
});

export const updateRouteSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  vanId: z.uuid("Invalid van ID"),
  driverIds: z.array(z.string().uuid()).optional(),
});

export const StartShiftBodySchema = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((d) => (d.lat == null) === (d.lng == null), {
    message: "lat and lng must both be provided or both omitted",
  });

export const ConfirmStartStopBodySchema = z.object({
  stopId: z.uuid("Invalid stop ID"),
});
