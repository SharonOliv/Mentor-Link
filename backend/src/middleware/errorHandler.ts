import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const status = isAppError ? err.status : "error";

  if (!isAppError) {
    // Unexpected error - log full detail server-side, don't leak it to the client
    console.error("[unexpected error]", err);
  }

  res.status(statusCode).json({
    status,
    message: isAppError ? err.message : "Something went wrong",
    ...(env.isProduction ? {} : { stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    status: "fail",
    message: `Route ${req.originalUrl} not found`,
  });
};
