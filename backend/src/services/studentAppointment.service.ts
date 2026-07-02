import { Appointment, IAppointment } from "../models/Appointment";

export const getOpenSlotsForMentor = async (mentorId: string): Promise<IAppointment[]> => {
  return Appointment.find({ mentorId, status: "open" }).sort({ scheduledAt: 1 });
};

export const getStudentBookings = async (studentId: string): Promise<IAppointment[]> => {
  return Appointment.find({ bookedBy: studentId })
    .populate("mentorId", "name department email")
    .sort({ scheduledAt: 1 });
};
