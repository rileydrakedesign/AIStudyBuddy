import { Schema } from "mongoose";
import { connectToStudyBuddyDb } from "../db/connection.js";
// Our schema, typed with IChunk
const chunkSchema = new Schema({
    text: { type: String },
    embedding: { type: [Number] },
    file_name: { type: String },
    title: { type: String },
    author: { type: String },
    user_id: { type: String },
    class_id: { type: String },
    doc_id: { type: String },
    is_summary: { type: Boolean },
    page_number: { type: Number },
}, {
    collection: "study_materials2",
});
// We'll store the model once we create it
let ChunkModel = null;
/**
 * Returns a Mongoose model for the 'study_materials2' collection,
 * typed with the IChunk interface.
 */
export default async function getChunkModel() {
    if (ChunkModel) {
        return ChunkModel;
    }
    // Connect to the 'study_buddy_demo' DB
    const studyConnection = await connectToStudyBuddyDb();
    // Create the typed model
    ChunkModel = studyConnection.model("Chunk", chunkSchema);
    return ChunkModel;
}
//# sourceMappingURL=chunkModel.js.map