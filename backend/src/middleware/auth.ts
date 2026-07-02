import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { verifyAccessToken } from "../utils/token";
import { User } from "../models/User";
import { UserRole } from "../types/enums";

/**
 * Verifies the access token and attaches the decoded payload to req.user.
 * Replaces the old `verifyToken` — same job, but now reads from the
 * Authorization header only for the access token (the refresh token lives
 * in an httpOnly cookie and is only ever read by the refresh endpoint).
 */
export const protect = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  let token = "";

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new AppError("You are not logged in. Please log in to continue.", 401));
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    return next(new AppError("Invalid or expired session. Please log in again.", 401));
  }

  // Confirm the account still exists and hasn't been disabled since the token was issued
  const user = await User.findById(decoded.id);
  if (!user) {
    return next(new AppError("The account for this session no longer exists.", 401));
  }
  if (user.status === "disabled") {
    return next(new AppError("This account has been disabled. Contact an administrator.", 403));
  }

  req.user = {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  };

  next();
});

/**
 * RBAC gate — replaces the old `allow(...roles)`. Usage is identical:
 * router.post('/', protect, restrictTo('admin'), handler)
 */
export const restrictTo = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError("You do not have permission to perform this action.", 403));
      return;
    }
    next();
  };
};
