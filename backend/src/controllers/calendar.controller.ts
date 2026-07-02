import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import * as calendarService from "../services/calendar.service";

export const getConnectUrl = catchAsync(async (req: Request, res: Response) => {
  const url = calendarService.getGoogleAuthUrl(req.user!.id);
  res.status(200).json({ status: "success", data: { url } });
});

/**
 * Google redirects the mentor's browser here after consent — this is a
 * GET request from Google, not an API call from our frontend, so it
 * redirects back into the frontend app at the end rather than returning
 * JSON.
 */
export const handleCallback = catchAsync(async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(`${env.frontendUrl}/mentor/dashboard?calendar=denied`);
    return;
  }

  if (typeof code !== "string" || typeof state !== "string") {
    throw new AppError("Invalid callback parameters from Google.", 400);
  }

  // `state` carries the mentor's user ID — see calendar.service.ts for why
  await calendarService.handleGoogleCallback(code, state);

  res.redirect(`${env.frontendUrl}/mentor/dashboard?calendar=connected`);
});

export const disconnect = catchAsync(async (req: Request, res: Response) => {
  await calendarService.disconnectGoogleCalendar(req.user!.id);
  res.status(200).json({ status: "success", message: "Google Calendar disconnected" });
});

export const getStatus = catchAsync(async (req: Request, res: Response) => {
  const connected = await calendarService.isCalendarConnected(req.user!.id);
  res.status(200).json({ status: "success", data: { connected } });
});
