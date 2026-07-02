import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * The original Message model stored `from`/`to` as raw email strings with no
 * reference to the User collection — that means no way to populate sender
 * details, no referential integrity if a user's email ever changes, and no
 * efficient index for "all messages between user A and user B". Switching
 * to ObjectId refs fixes all three.
 */
export interface IMessage extends Document {
  from: Types.ObjectId;
  to: Types.ObjectId;
  messageText: string;
  read: boolean;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    from: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    to: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    messageText: {
      type: String,
      required: true,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Fast lookup of a conversation thread between two specific users
messageSchema.index({ from: 1, to: 1, createdAt: -1 });
messageSchema.index({ to: 1, read: 1 });

export const Message: Model<IMessage> = mongoose.model<IMessage>(
  "Message",
  messageSchema
);
