import { z } from "zod";

export const createSlotSchema = z.object({
  scheduledAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), {
    message: "scheduledAt must be in the future",
  }),
  durationMinutes: z.number().int().min(10).max(240).optional().default(30),
});

export const createSlotsBatchSchema = z.object({
  slots: z.array(createSlotSchema).min(1).max(100),
});

export type CreateSlotInput = z.infer<typeof createSlotSchema>;
