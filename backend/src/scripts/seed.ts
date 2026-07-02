import { connectToDatabase } from "../config/db";
import { User } from "../models/User";
import { Appointment } from "../models/Appointment";
import mongoose from "mongoose";

const seed = async () => {
  await connectToDatabase();

  console.log("[seed] clearing existing test data...");
  await User.deleteMany({});
  await Appointment.deleteMany({});

  console.log("[seed] creating admin...");
  await User.create({
    email: "admin@university.edu",
    password: "Admin@12345",
    name: "System Admin",
    role: "admin",
  });

  console.log("[seed] creating mentors...");
  const mentor1 = await User.create({
    email: "priya.sharma@university.edu",
    password: "Mentor@12345",
    name: "Dr. Priya Sharma",
    role: "mentor",
    department: "Computer Science",
    subjects: ["Data Structures", "Algorithms"],
    mustChangePassword: false,
  });

  const mentor2 = await User.create({
    email: "james.okoro@university.edu",
    password: "Mentor@12345",
    name: "Dr. James Okoro",
    role: "mentor",
    department: "Mathematics",
    subjects: ["Calculus", "Linear Algebra"],
    mustChangePassword: false,
  });

  console.log("[seed] creating students...");
  const student1 = await User.create({
    email: "aisha.khan@university.edu",
    password: "Student@12345",
    name: "Aisha Khan",
    role: "student",
    department: "Computer Science",
    mustChangePassword: false,
  });

  const student2 = await User.create({
    email: "liam.chen@university.edu",
    password: "Student@12345",
    name: "Liam Chen",
    role: "student",
    department: "Mathematics",
    mustChangePassword: false,
  });

  console.log("[seed] creating appointment slots...");
  const now = new Date();
  const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  await Appointment.create([
    { mentorId: mentor1._id, scheduledAt: inDays(1), status: "open" },
    { mentorId: mentor1._id, scheduledAt: inDays(2), status: "open" },
    {
      mentorId: mentor1._id,
      scheduledAt: inDays(3),
      status: "booked",
      bookedBy: student1._id,
      bookingStatus: "pending",
    },
    { mentorId: mentor2._id, scheduledAt: inDays(1), status: "open" },
    {
      mentorId: mentor2._id,
      scheduledAt: inDays(2),
      status: "booked",
      bookedBy: student2._id,
      bookingStatus: "approved",
    },
  ]);

  console.log("[seed] done.");
  console.log("\nTest accounts (all use the password shown):");
  console.log("  Admin:   admin@university.edu / Admin@12345");
  console.log("  Mentor:  priya.sharma@university.edu / Mentor@12345");
  console.log("  Mentor:  james.okoro@university.edu / Mentor@12345");
  console.log("  Student: aisha.khan@university.edu / Student@12345");
  console.log("  Student: liam.chen@university.edu / Student@12345");

  await mongoose.connection.close();
  process.exit(0);
};

seed().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
