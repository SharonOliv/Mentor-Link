import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { AppError } from "../utils/AppError";
import * as adminService from "../services/admin.service";

export const createUser = catchAsync(async (req: Request, res: Response) => {
  const result = await adminService.createUser(req.body);

  // tempPassword is returned once, here, to the admin who created the
  // account — it is never stored in plaintext and never shown again after
  // this response. The admin is expected to relay it to the new user
  // through whatever channel the university normally uses for onboarding.
  res.status(201).json({
    status: "success",
    message: "User created",
    data: result,
  });
});

export const bulkImportUsers = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError("No CSV file uploaded", 400);
  }

  const result = await adminService.bulkImportUsers(req.file.buffer);

  res.status(200).json({
    status: "success",
    message: `${result.created.length} created, ${result.skipped.length} skipped`,
    data: result,
  });
});

export const listUsers = catchAsync(async (req: Request, res: Response) => {
  const { role, department } = req.query;
  const users = await adminService.listUsers({
    role: typeof role === "string" ? role : undefined,
    department: typeof department === "string" ? department : undefined,
  });

  res.status(200).json({
    status: "success",
    data: { users },
  });
});

export const setUserStatus = catchAsync(async (req: Request, res: Response) => {
  const user = await adminService.setUserStatus(req.params.id, req.body.status);

  res.status(200).json({
    status: "success",
    data: { user },
  });
});

export const deleteUser = catchAsync(async (req: Request, res: Response) => {
  await adminService.deleteUserCascade(req.params.id);

  res.status(200).json({
    status: "success",
    message: "User and related data deleted",
  });
});
