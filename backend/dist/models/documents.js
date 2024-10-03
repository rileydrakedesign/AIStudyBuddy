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
    // Additional fields as needed
});
export default mongoose.model("Document", documentSchema);
//# sourceMappingURL=documents.js.map