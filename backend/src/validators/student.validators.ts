import { z } from "zod";

export const mentorIdParamSchema = z.object({
  mentorId: z.string().min(1),
});
