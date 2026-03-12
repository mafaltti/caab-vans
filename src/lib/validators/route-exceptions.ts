import { z } from "zod";
import { SKIP_REASON_CODES, DETOUR_REASON_CODES } from "@/types";

export const SkipStopBodySchema = z
  .object({
    stopId: z.string().uuid("stopId must be a valid UUID"),
    reasonCode: z.enum(SKIP_REASON_CODES, {
      errorMap: () => ({ message: `reasonCode must be one of: ${SKIP_REASON_CODES.join(", ")}` }),
    }),
    note: z.string().max(500, "note must be at most 500 characters").optional(),
  })
  .refine(
    (data) => data.reasonCode !== "other" || (data.note && data.note.trim().length > 0),
    { message: "note is required when reasonCode is 'other'", path: ["note"] },
  );

export type SkipStopBody = z.infer<typeof SkipStopBodySchema>;

export const DetourBodySchema = z
  .object({
    action: z.enum(["start", "end"]),
    reasonCode: z
      .enum(DETOUR_REASON_CODES, {
        errorMap: () => ({ message: `reasonCode must be one of: ${DETOUR_REASON_CODES.join(", ")}` }),
      })
      .optional(),
    note: z.string().max(500, "note must be at most 500 characters").optional(),
  })
  .refine(
    (data) => data.action !== "start" || data.reasonCode != null,
    { message: "reasonCode is required when action is 'start'", path: ["reasonCode"] },
  )
  .refine(
    (data) =>
      data.action !== "start" ||
      data.reasonCode !== "other" ||
      (data.note && data.note.trim().length > 0),
    { message: "note is required when reasonCode is 'other'", path: ["note"] },
  );

export type DetourBody = z.infer<typeof DetourBodySchema>;
