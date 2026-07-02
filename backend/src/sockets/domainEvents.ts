import { EventEmitter } from "events";

/**
 * A small internal event bus. Services emit domain events here
 * (`appointment.booked`, `appointment.approved`, etc.) without needing to
 * import Socket.IO directly. The sockets layer (sockets/index.ts) is the
 * only thing that listens to this bus and translates events into actual
 * socket emissions to the right rooms.
 *
 * Why bother with this instead of just importing `io` into the services:
 * a service importing the socket server directly means appointment.service.ts
 * can't be unit-tested or reasoned about without a live Socket.IO instance,
 * and it tightly couples "approve a booking" to "how real-time delivery
 * happens to work today." If real-time delivery changes later (a different
 * library, a message queue, whatever), only this file's listeners change —
 * not every service that emits a domain event.
 */
export const domainEvents = new EventEmitter();

export type DomainEventName =
  | "appointment.slot_created"
  | "appointment.booked"
  | "appointment.approved"
  | "appointment.rejected"
  | "appointment.slot_deleted"
  | "notification.created";

export const emitDomainEvent = (event: DomainEventName, payload: unknown): void => {
  domainEvents.emit(event, payload);
};
