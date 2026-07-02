import mongoose from "mongoose";
import { env } from "./env";

export const connectToDatabase = async (): Promise<void> => {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(env.dbUrl);
    console.log("[database] connected");
  } catch (error) {
    console.error("[database] connection failed:", error);
    process.exit(1);
  }
};

mongoose.connection.on("disconnected", () => {
  console.warn("[database] disconnected");
});
