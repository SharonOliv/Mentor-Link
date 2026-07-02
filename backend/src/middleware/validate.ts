import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../utils/AppError";

/**
 * Validates req.body against the given Zod schema. On failure, responds
 * with a 400 listing every field-level error — this replaces the pattern in
 * the original controllers of trusting req.body directly and letting
 * Mongoose validation errors (if any) bubble up as opaque 500s.
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      next(new AppError(message || "Invalid request data", 400));
      return;
    }

    req.body = result.data;
    next();
  };
};
