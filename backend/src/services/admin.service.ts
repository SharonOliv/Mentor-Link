import { User, IUser } from "../models/User";
import { Appointment } from "../models/Appointment";
import { Message } from "../models/Message";
import { AppError } from "../utils/AppError";
import { generateTempPassword } from "../utils/password";
import { CreateUserInput, CsvUserRow } from "../validators/admin.validators";
import { UserStatus } from "../types/enums";
import { parse } from "csv-parse/sync";
import { sendMailAsync } from "./email.service";
import { tempPasswordEmail } from "../utils/emailTemplates";

interface CreatedAccount {
  email: string;
  name: string;
  role: string;
  tempPassword: string;
}

/**
 * Single-account creation. This is the endpoint that replaces both
 * "Student Registration" and "Mentor Registration" — admin is the only
 * caller, role is an explicit required field (not inferred from which
 * registration form was submitted), and a temp password is generated
 * server-side rather than chosen by the new user, since they don't exist
 * yet to choose one.
 */
export const createUser = async (input: CreateUserInput): Promise<CreatedAccount> => {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw new AppError("A user with this email already exists", 409);
  }

  const tempPassword = generateTempPassword();

  const user = await User.create({
    ...input,
    password: tempPassword,
    mustChangePassword: true,
  });

  sendMailAsync({
    to: user.email,
    subject: "Your account has been created",
    html: tempPasswordEmail(user.name, user.email, tempPassword),
  });

  return {
    email: user.email,
    name: user.name,
    role: user.role,
    tempPassword,
  };
};

interface BulkImportResult {
  created: CreatedAccount[];
  skipped: { row: number; email: string; reason: string }[];
}

/**
 * Bulk import from a CSV buffer. Expected columns: email,name,role,department,subjects
 * `subjects` is comma-separated within the cell (mentors only), e.g. "Algorithms,Data Structures"
 *
 * Each row is processed independently — one bad row doesn't abort the whole
 * batch, since a university onboarding a cohort of 200 students doesn't want
 * row 147's typo to mean rows 1-146 also failed.
 */
export const bulkImportUsers = async (csvBuffer: Buffer): Promise<BulkImportResult> => {
  const records: Record<string, string>[] = parse(csvBuffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const created: CreatedAccount[] = [];
  const skipped: { row: number; email: string; reason: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const rawRow = records[i];
    const rowNum = i + 2; // +1 for 0-index, +1 for header row

    try {
      const row = validateCsvRow(rawRow);

      const existing = await User.findOne({ email: row.email });
      if (existing) {
        skipped.push({ row: rowNum, email: row.email, reason: "Email already exists" });
        continue;
      }

      if ((row.role === "student" || row.role === "mentor") && !row.department) {
        skipped.push({
          row: rowNum,
          email: row.email,
          reason: "Department is required for student/mentor",
        });
        continue;
      }

      const tempPassword = generateTempPassword();
      const subjects = row.subjects
        ? row.subjects.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const user = await User.create({
        email: row.email,
        name: row.name,
        role: row.role,
        department: row.department,
        subjects,
        password: tempPassword,
        mustChangePassword: true,
      });

      created.push({
        email: user.email,
        name: user.name,
        role: user.role,
        tempPassword,
      });

      sendMailAsync({
        to: user.email,
        subject: "Your account has been created",
        html: tempPasswordEmail(user.name, user.email, tempPassword),
      });
    } catch (err) {
      skipped.push({
        row: rowNum,
        email: rawRow.email || "(unknown)",
        reason: err instanceof Error ? err.message : "Invalid row",
      });
    }
  }

  return { created, skipped };
};

// Minimal row-level validation, kept separate from the Zod schema so a bad
// row produces a clear per-field reason rather than a generic parse failure.
const validateCsvRow = (row: Record<string, string>): CsvUserRow => {
  if (!row.email || !row.email.includes("@")) {
    throw new Error("Invalid or missing email");
  }
  if (!row.name) {
    throw new Error("Missing name");
  }
  if (!["student", "mentor", "admin"].includes(row.role)) {
    throw new Error(`Invalid role "${row.role}"`);
  }
  return row as CsvUserRow;
};

export const listUsers = async (filters: { role?: string; department?: string }) => {
  const query: Record<string, unknown> = {};
  if (filters.role) query.role = filters.role;
  if (filters.department) query.department = filters.department;

  return User.find(query).collation({ locale: "en", strength: 2 }).sort({ createdAt: -1 });
};

/**
 * Public-ish mentor directory for students browsing who to book with.
 * Deliberately returns a narrower field set than the admin listUsers above —
 * students don't need (and shouldn't see) account status or internal flags
 * for other users.
 */
export const listMentorsForStudents = async (department?: string) => {
  const query: Record<string, unknown> = { role: "mentor", status: "active" };
  if (department) query.department = department;

  return User.find(query)
    .select("name department subjects")
    .collation({ locale: "en", strength: 2 })
    .sort({ name: 1 });
};

export const setUserStatus = async (userId: string, status: UserStatus): Promise<IUser> => {
  const user = await User.findByIdAndUpdate(userId, { status }, { new: true });
  if (!user) {
    throw new AppError("User not found", 404);
  }
  return user;
};

/**
 * Deletes a user and their related data. The original deleteTeacher matched
 * appointments/messages by email string; with the new schema everything is
 * matched by ObjectId, which is both correct and actually indexed.
 */
export const deleteUserCascade = async (userId: string): Promise<void> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  await User.findByIdAndDelete(userId);
  await Appointment.deleteMany({ $or: [{ mentorId: userId }, { bookedBy: userId }] });
  await Message.deleteMany({ $or: [{ from: userId }, { to: userId }] });
};
