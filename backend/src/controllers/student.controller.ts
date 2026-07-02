import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import * as appointmentService from "../services/appointment.service";
import * as studentAppointmentService from "../services/studentAppointment.service";
import * as adminService from "../services/admin.service";

export const listMentors = catchAsync(async (req: Request, res: Response) => {
  const department = typeof req.query.department === "string" ? req.query.department : undefined;
  const mentors = await adminService.listMentorsForStudents(department);
  res.status(200).json({ status: "success", data: { mentors } });
});

export const getMentorSlots = catchAsync(async (req: Request, res: Response) => {
  const slots = await studentAppointmentService.getOpenSlotsForMentor(req.params.mentorId);
  res.status(200).json({ status: "success", data: { slots } });
});

export const bookSlot = catchAsync(async (req: Request, res: Response) => {
  const appointment = await appointmentService.bookSlot(req.params.id, req.user!.id);
  res.status(200).json({ status: "success", data: { appointment } });
});

export const getMyBookings = catchAsync(async (req: Request, res: Response) => {
  const bookings = await studentAppointmentService.getStudentBookings(req.user!.id);
  res.status(200).json({ status: "success", data: { bookings } });
});
