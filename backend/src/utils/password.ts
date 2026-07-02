import crypto from "crypto";

/**
 * Generates a readable-ish temporary password for admin-created accounts.
 * Not meant to be memorable — it's emailed to the user once and they're
 * forced to change it via mustChangePassword on first login.
 */
export const generateTempPassword = (): string => {
  // 12 random bytes -> ~16 base64url chars, comfortably above the 8-char minimum
  return crypto.randomBytes(12).toString("base64url");
};
