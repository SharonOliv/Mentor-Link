import { z } from "zod";

const baseUserFields = {
  email: z.string().email("Enter a valid email address"),
  name: z.string().min(1, "Name is required"),
};

export const createUserSchema = z.discriminatedUnion("role", [
  z.object({
    ...baseUserFields,
    role: z.literal("admin"),
  }),
  z.object({
    ...baseUserFields,
    role: z.literal("mentor"),
    department: z.string().min(1, "Department is required"),
    subjects: z.array(z.string()).optional().default([]),
  }),
  z.object({
    ...baseUserFields,
    role: z.literal("student"),
    department: z.string().min(1, "Department is required"),
  }),
]);

export type CreateUserInput = z.infer<typeof createUserSchema>;

// One row from a bulk-import CSV. Same shape as createUserSchema but every
// field arrives as a raw string from the CSV parser, so we coerce/validate
// rather than reusing the discriminated union directly.
export const csvUserRowSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["student", "mentor", "admin"]),
  department: z.string().optional(),
  subjects: z.string().optional(), // comma-separated in the CSV, split before saving
});

export type CsvUserRow = z.infer<typeof csvUserRowSchema>;

export const updateUserStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});
