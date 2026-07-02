import { User, IUser } from "../models/User";
import { AppError } from "../utils/AppError";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/token";

interface LoginResult {
  user: Pick<IUser, "id" | "email" | "name" | "role" | "mustChangePassword">;
  accessToken: string;
  refreshToken: string;
}

/**
 * The single, role-agnostic login. This is the core of the auth rebuild:
 * one function, one lookup by email, and the role comes back as a property
 * of the account — not from which endpoint the client happened to call.
 */
export const loginUser = async (email: string, password: string): Promise<LoginResult> => {
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    // Same message whether the email doesn't exist or the password is wrong —
    // distinguishing the two lets an attacker enumerate valid emails.
    throw new AppError("Incorrect email or password", 401);
  }

  if (user.status === "disabled") {
    throw new AppError("This account has been disabled. Contact an administrator.", 403);
  }

  const isValid = await user.comparePassword(password);
  if (!isValid) {
    throw new AppError("Incorrect email or password", 401);
  }

  const accessToken = signAccessToken({
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
  const refreshToken = signRefreshToken({ id: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    accessToken,
    refreshToken,
  };
};

/**
 * Issues a new access token from a still-valid refresh token. Does not
 * rotate the refresh token itself in this phase — refresh token rotation
 * (invalidating the old one on each use) is a reasonable later hardening
 * step, noted here rather than silently skipped.
 */
export const refreshAccessToken = async (refreshToken: string): Promise<string> => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Session expired. Please log in again.", 401);
  }

  const user = await User.findById(decoded.id);
  if (!user || user.status === "disabled") {
    throw new AppError("Session no longer valid. Please log in again.", 401);
  }

  return signAccessToken({
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
};

export const changeOwnPassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const isValid = await user.comparePassword(currentPassword);
  if (!isValid) {
    throw new AppError("Current password is incorrect", 401);
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();
};
