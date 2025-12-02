import mongoose, { Schema } from "mongoose";
import { randomUUID } from "crypto";
const documentSchema = new Schema({
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
export default mongoose.model("Document", documentSchema);
//# sourceMappingURL=documents.js.map