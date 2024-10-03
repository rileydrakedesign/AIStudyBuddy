import mongoose, { Document, Schema } from "mongoose";
import { randomUUID } from "crypto";

// Define a TypeScript interface for your Document model
export interface IDocument extends Document {
  userId: mongoose.Types.ObjectId;
  fileName?: string;
  docId: string;
  uploadedAt?: Date;
  s3Key: string;
  s3Url: string;
  className: string;
  // Add any additional fields here
}

const documentSchema = new Schema<IDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  s3Key: {
    type: String,
    required: true,
  },
  s3Url: {
    type: String,
    required: true,
  },
  docId: {
    type: String,
    default: randomUUID,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  className: {
    type: String,
    required: true,
  },
  // Additional fields as needed
});

export default mongoose.model<IDocument>("Document", documentSchema);
