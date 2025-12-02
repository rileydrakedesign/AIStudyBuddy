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
  // NEW: optional isProcessing to track whether this doc is still uploading/processing
  isProcessing?: boolean;
  // NEW: optional pdfS3Key for DOCX files converted to PDF for viewing
  pdfS3Key?: string;
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
  // NEW: isProcessing field to mark documents that haven't finished uploading/processing
  isProcessing: {
    type: Boolean,
    default: false,
  },
  // NEW: pdfS3Key for DOCX files converted to PDF for viewing
  pdfS3Key: {
    type: String,
    required: false,
  },
});

export default mongoose.model<IDocument>("Document", documentSchema);
