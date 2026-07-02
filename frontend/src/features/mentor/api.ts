import { api } from "../../api/client";
import { Appointment } from "../../types";

export const fetchMySlots = async (): Promise<Appointment[]> => {
  const { data } = await api.get<{ data: { slots: Appointment[] } }>("/mentor/slots");
  return data.data.slots;
};

export const fetchPendingBookings = async (): Promise<Appointment[]> => {
  const { data } = await api.get<{ data: { bookings: Appointment[] } }>(
    "/mentor/bookings/pending"
  );
  return data.data.bookings;
};

export const createSlot = async (scheduledAt: string, durationMinutes = 30): Promise<Appointment> => {
  const { data } = await api.post<{ data: { slot: Appointment } }>("/mentor/slots", {
    scheduledAt,
    durationMinutes,
  });
  return data.data.slot;
};

export const deleteSlot = async (id: string): Promise<void> => {
  await api.delete(`/mentor/slots/${id}`);
};

export const approveBooking = async (id: string): Promise<Appointment> => {
  const { data } = await api.patch<{ data: { appointment: Appointment } }>(
    `/mentor/bookings/${id}/approve`
  );
  return data.data.appointment;
};

export const rejectBooking = async (id: string): Promise<Appointment> => {
  const { data } = await api.patch<{ data: { appointment: Appointment } }>(
    `/mentor/bookings/${id}/reject`
  );
  return data.data.appointment;
};
