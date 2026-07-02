import mongoose, { Schema, Document, Model } from "mongoose";
import bcrypt from "bcryptjs";
import { UserRole, UserStatus } from "../types/enums";

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  department?: string;
  subjects: string[];
  status: UserStatus;
  mustChangePassword: boolean;
  googleCalendarTokens?: {
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
      minlength: 8,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    role: {
      type: String,
      enum: ["student", "mentor", "admin"],
      required: true,
    },
    department: {
      type: String,
      // required only for student/mentor — enforced in the pre-validate hook below,
      // not at the schema level, since "required" depending on another field's value
      // isn't expressible directly in Mongoose's declarative schema syntax.
      trim: true,
    },
    subjects: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
    },
    mustChangePassword: {
      type: Boolean,
      default: true, // true by default since admin sets the initial password
    },
    googleCalendarTokens: {
      type: {
        accessToken: String,
        refreshToken: String,
        expiryDate: Number,
      },
      required: false,
      select: false,
    },
  },
  { timestamps: true }
);

// department is required for student/mentor accounts, optional for admin
userSchema.pre("validate", function (next) {
  if ((this.role === "student" || this.role === "mentor") && !this.department) {
    this.invalidate("department", "Department is required for students and mentors");
  }
  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// Case-insensitive department/role lookups, used by admin filtering and student
// browsing mentor lists by department
userSchema.index(
  { department: 1, role: 1, status: 1 },
  { collation: { locale: "en", strength: 2 } }
);

export const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);
