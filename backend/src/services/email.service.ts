import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      auth: {
        user: env.mail.user,
        pass: env.mail.pass,
      },
    });
  }
  return transporter;
};

interface MailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Fire-and-forget email send. The original controllers `await`ed
 * `transporter.sendMail(...)` directly inside the request handler — if the
 * mail server is slow or unreachable, the HTTP response (e.g. "appointment
 * approved") hangs on it. A booking approval should succeed in the database
 * immediately regardless of whether the notification email is delivered a
 * few seconds later, so this fires the send and logs failures without
 * making the caller wait or fail because of them.
 */
export const sendMailAsync = (input: MailInput): void => {
  getTransporter()
    .sendMail({
      from: `"Faculty Appointments" <${env.mail.user}>`,
      to: input.to,
      subject: input.subject,
      html: input.html,
    })
    .catch((err: Error) => {
      console.error(`[email] failed to send "${input.subject}" to ${input.to}:`, err.message);
    });
};
