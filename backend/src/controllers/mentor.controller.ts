import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import * as appointmentService from "../services/appointment.service";

export const createSlot = catchAsync(async (req: Request, res: Response) => {
  const slot = await appointmentService.createSlot(req.user!.id, req.body);
  res.status(201).json({ status: "success", data: { slot } });
});

export const createSlotsBatch = catchAsync(async (req: Request, res: Response) => {
  const result = await appointmentService.createSlotsBatch(req.user!.id, req.body.slots);
  res.status(201).json({
    status: "success",
    message: `${result.created.length} slot(s) created, ${result.skipped.length} skipped`,
    data: result,
  });
});

export const getMySlots = catchAsync(async (req: Request, res: Response) => {
  const slots = await appointmentService.getMentorSlots(req.user!.id);
  res.status(200).json({ status: "success", data: { slots } });
});

export const getPendingBookings = catchAsync(async (req: Request, res: Response) => {
  const bookings = await appointmentService.getMentorPendingBookings(req.user!.id);
  res.status(200).json({ status: "success", data: { bookings } });
});

export const approveBooking = catchAsync(async (req: Request, res: Response) => {
  const appointment = await appointmentService.approveBooking(req.params.id, req.user!.id);
  res.status(200).json({ status: "success", data: { appointment } });
});

export const rejectBooking = catchAsync(async (req: Request, res: Response) => {
  const appointment = await appointmentService.rejectBooking(req.params.id, req.user!.id);
  res.status(200).json({ status: "success", data: { appointment } });
});

export const deleteSlot = catchAsync(async (req: Request, res: Response) => {
  await appointmentService.deleteSlot(req.params.id, req.user!.id);
  res.status(200).json({ status: "success", message: "Slot deleted" });
});
