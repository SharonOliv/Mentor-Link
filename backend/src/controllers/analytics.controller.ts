import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import * as analyticsService from "../services/analytics.service";

export const getSummary = catchAsync(async (req: Request, res: Response) => {
  const summary = await analyticsService.getDashboardSummary();
  res.status(200).json({ status: "success", data: summary });
});
