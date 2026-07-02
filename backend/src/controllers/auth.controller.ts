import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { env } from "../config/env";
import * as authService from "../services/auth.service";

const REFRESH_COOKIE_NAME = "refreshToken";

const refreshCookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "lax" as const,
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matches JWT_REFRESH_EXPIRES_IN default
};

export const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const { user, accessToken, refreshToken } = await authService.loginUser(email, password);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);

  res.status(200).json({
    status: "success",
    data: { user, accessToken },
  });
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ status: "fail", message: "No refresh token provided" });
    return;
  }

  const accessToken = await authService.refreshAccessToken(token);

  res.status(200).json({
    status: "success",
    data: { accessToken },
  });
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/v1/auth" });
  res.status(200).json({ status: "success", message: "Logged out" });
});

export const changePassword = catchAsync(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changeOwnPassword(req.user!.id, currentPassword, newPassword);

  res.status(200).json({
    status: "success",
    message: "Password updated",
  });
});

export const getMe = catchAsync(async (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    data: { user: req.user },
  });
});
