import { z } from "zod/v4";

export const createRouteSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  vanId: z.uuid("Invalid van ID"),
});

export const updateRouteSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  vanId: z.uuid("Invalid van ID"),
});
