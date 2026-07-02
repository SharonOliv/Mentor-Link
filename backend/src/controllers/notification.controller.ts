import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import * as notificationService from "../services/notification.service";

export const listMyNotifications = catchAsync(async (req: Request, res: Response) => {
  const notifications = await notificationService.listNotifications(req.user!.id);
  res.status(200).json({ status: "success", data: { notifications } });
});

export const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const count = await notificationService.getUnreadCount(req.user!.id);
  res.status(200).json({ status: "success", data: { count } });
});

export const markAsRead = catchAsync(async (req: Request, res: Response) => {
  await notificationService.markAsRead(req.params.id, req.user!.id);
  res.status(200).json({ status: "success" });
});

export const markAllAsRead = catchAsync(async (req: Request, res: Response) => {
  await notificationService.markAllAsRead(req.user!.id);
  res.status(200).json({ status: "success" });
});
