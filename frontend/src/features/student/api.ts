import { api } from "../../api/client";
import { Appointment, Mentor } from "../../types";

export const fetchMentors = async (department?: string): Promise<Mentor[]> => {
  const { data } = await api.get<{ data: { mentors: Mentor[] } }>("/student/mentors", {
    params: department ? { department } : undefined,
  });
  return data.data.mentors;
};

export const fetchMentorSlots = async (mentorId: string): Promise<Appointment[]> => {
  const { data } = await api.get<{ data: { slots: Appointment[] } }>(
    `/student/mentors/${mentorId}/slots`
  );
  return data.data.slots;
};

export const bookSlot = async (slotId: string): Promise<Appointment> => {
  const { data } = await api.patch<{ data: { appointment: Appointment } }>(
    `/student/slots/${slotId}/book`
  );
  return data.data.appointment;
};

export const fetchMyBookings = async (): Promise<Appointment[]> => {
  const { data } = await api.get<{ data: { bookings: Appointment[] } }>("/student/bookings");
  return data.data.bookings;
};
