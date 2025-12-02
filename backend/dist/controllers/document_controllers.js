import mongoose from "mongoose";
import Document from "../models/documents.js";
import User from "../models/user.js";
import ChatSession from "../models/chatSession.js";
import getChunkModel from "../models/chunkModel.js";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import multer from "multer";
import dotenv from "dotenv";
dotenv.config();
const bucketName = process.env.AWS_S3_BUCKET_NAME;
const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET;
const s3Client = new S3Client({
    region,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});
// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Configure Multer for file uploads (store files in memory)
const upload = multer({ storage: multer.memoryStorage() });
// Function to upload file to S3
async function uploadFileToS3(fileBuffer, fileName, mimetype) {
    const uploadParams = {
        Bucket: bucketName,
        Body: fileBuffer,
        Key: fileName,
        ContentType: mimetype,
        ContentDisposition: "inline",
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
}
// Function to delete file from S3
async function deleteFileFromS3(fileName) {
    const deleteParams = {
        Bucket: bucketName,
        Key: fileName,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));
}
// Function to get pre-signed URL for an object
async function getObjectSignedUrl(key) {
    const params = {
        Bucket: bucketName,
        Key: key,
    };
    const command = new GetObjectCommand(params);
    const seconds = 60; // URL expires in 60 seconds
    const url = await getSignedUrl(s3Client, command, { expiresIn: seconds });
    return url;
}
// Export the Multer upload middleware
export const uploadMiddleware = upload.array("files", 5);
/**
 * Upload a document, store it in Mongo (isProcessing = true),
 * respond immediately, then call FastAPI in the background
 * to do chunking/embedding (which sets isProcessing=false).
 */
export const uploadDocument = async (req, res, next) => {
    try {
        req.log.info("📤 uploadDocument: START");
        /* ---------- AUTH ---------- */
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res.status(401).json({ message: "User not registered or token malfunctioned" });
        }
        const userId = currentUser._id.toString();
        const files = req.files;
        const className = req.body.className || "General";
        req.log.info({
            filesCount: files?.length || 0,
            className,
            userId
        }, "📤 uploadDocument: Auth and files received");
        if (!files || files.length === 0) {
            return res.status(400).json({ message: "No file uploaded" });
        }
        /* ==================================================================
           FREE-TIER DOCUMENT LIMIT  (NEW)
        ================================================================== */
        if (currentUser.plan === "free") {
            const existingDocs = await Document.countDocuments({ userId: currentUser._id });
            const remaining = 3 - existingDocs;
            if (remaining <= 0) {
                return res.status(403).json({
                    message: "Free plan users may store up to 3 documents. Delete a document or upgrade to premium.",
                });
            }
            if (files.length > remaining) {
                return res.status(403).json({
                    message: `Free plan: you have space for ${remaining} more document(s). Reduce your upload or upgrade.`,
                });
            }
        }
        /* ================================================================== */
        /* ---------- ensure class exists ---------- */
        if (!currentUser.classes.some((c) => c.name === className)) {
            currentUser.classes.push({ name: className });
            await currentUser.save();
        }
        /* ---------- create docs (isProcessing = true) ---------- */
        const uploadedDocs = [];
        for (const file of files) {
            if (!file)
                continue;
            req.log.info({
                fileName: file.originalname,
                s3Key: file.key,
                s3Url: file.location,
                mimetype: file.mimetype,
                size: file.size
            }, "📤 uploadDocument: Creating document");
            const doc = new Document({
                userId,
                fileName: file.originalname,
                uploadedAt: Date.now(),
                s3Key: file.key, // populated by Multer if using S3 storage
                s3Url: file.location, // "
                className,
                isProcessing: true,
            });
            try {
                await doc.save();
                req.log.info({ docId: doc._id }, "📤 uploadDocument: Document saved successfully");
                uploadedDocs.push(doc);
            }
            catch (saveError) {
                req.log.error({
                    saveError,
                    fileName: file.originalname,
                    s3Key: file.key,
                    s3Url: file.location
                }, "📤 uploadDocument: FAILED to save document to MongoDB");
                throw saveError;
            }
        }
        /* ---------- immediate response ---------- */
        res.status(200).json({
            message: "Upload started",
            documents: uploadedDocs.map((d) => ({
                _id: d._id,
                fileName: d.fileName,
                className: d.className,
                isProcessing: d.isProcessing,
            })),
        });
        /* ---------- background FastAPI call ---------- */
        const pythonApiUrl = process.env.PYTHON_API_URL; // e.g. http://localhost:8000
        if (pythonApiUrl) {
            for (const doc of uploadedDocs) {
                axios
                    .post(`${pythonApiUrl}/api/v1/process_upload`, {
                    user_id: userId,
                    class_name: className,
                    s3_key: doc.s3Key,
                    doc_id: doc._id.toString(),
                })
                    .catch((err) => req.log.error({ err, docId: doc._id }, "FastAPI error during document processing"));
            }
        }
        else {
            req.log.warn("PYTHON_API_URL not set; background processing skipped.");
        }
    }
    catch (error) {
        req.log.error({
            error,
            errorMessage: error?.message,
            errorStack: error?.stack
        }, "📤 uploadDocument: ERROR in uploadDocument controller");
        return res.status(500).json({ message: "Server error", error: error?.message });
    }
};
/**
 * Returns all documents for the current user.
 */
export const getUserDocuments = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: "User not registered or token malfunctioned" });
        }
        const documents = await Document.find({ userId: currentUser._id });
        return res.status(200).json({ message: "OK", documents });
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
/**
 * Retrieves a pre-signed URL for the given document ID (PDF or otherwise).
 */
export const getDocumentFile = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: "User not registered or token malfunctioned" });
        }
        const documentId = req.params.id;
        const document = (await Document.findById(documentId));
        if (!document) {
            return res.status(404).json({ message: "Document not found" });
        }
        // Ensure this doc belongs to the authenticated user
        if (document.userId.toString() !== currentUser._id.toString()) {
            return res.status(403).json({ message: "Unauthorized access" });
        }
        // For DOCX files, check if we have a converted PDF available
        // If pdfS3Key exists, serve the PDF instead of the DOCX for viewing
        const viewKey = document.pdfS3Key || document.s3Key;
        const isPdfView = !!document.pdfS3Key;
        // LOG: Debug DOCX conversion
        if (document.fileName?.toLowerCase().endsWith(".docx")) {
            req.log.info({
                docId: documentId,
                fileName: document.fileName,
                hasPdfS3Key: !!document.pdfS3Key,
                pdfS3Key: document.pdfS3Key,
                originalS3Key: document.s3Key,
                viewKey: viewKey,
                isPdfView: isPdfView
            }, "DOCX file - checking for converted PDF");
        }
        let responseType;
        if (isPdfView || document.fileName?.toLowerCase().endsWith(".pdf")) {
            responseType = "application/pdf";
        }
        else if (document.fileName?.toLowerCase().endsWith(".docx")) {
            responseType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        }
        // Build a GetObjectCommand with inline disposition override
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: viewKey,
            ResponseContentDisposition: "inline",
            ResponseContentType: responseType,
        });
        // Generate a short-lived pre-signed URL
        const url = await getSignedUrl(s3Client, command, { expiresIn: 120 });
        // LOG: Debug URL generation
        req.log.info({
            docId: documentId,
            fileName: document.fileName,
            viewKey: viewKey,
            urlContainsPdf: url.includes('.pdf')
        }, "Generated pre-signed URL");
        return res.status(200).json({ url, fileName: document.fileName });
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};
/**
 * Deletes a document (both from S3 and from MongoDB) and cascades deletion:
 * - Removes chat sessions referencing this document.
 * - Removes processed document chunks stored in "study_materials2".
 */
export const deleteDocument = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: "User not registered or token malfunctioned" });
        }
        const documentId = req.params.id;
        const document = (await Document.findById(documentId));
        if (!document) {
            return res.status(404).json({ message: "Document not found" });
        }
        if (document.userId.toString() !== currentUser._id.toString()) {
            return res.status(403).json({ message: "Unauthorized access" });
        }
        // Delete the file from S3
        await deleteFileFromS3(document.s3Key);
        // Delete document record from MongoDB
        await Document.deleteOne({ _id: documentId });
        // Cascade deletion: Remove chat sessions that reference this document
        await ChatSession.deleteMany({
            userId: currentUser._id,
            assignedDocument: documentId,
        });
        // Cascade deletion: Remove processed document chunks from "study_materials2"
        const db = mongoose.connection.useDb("study_buddy_demo");
        const studyMaterialsCollection = db.collection("study_materials2");
        await studyMaterialsCollection.deleteMany({ doc_id: documentId });
        return res.status(200).json({
            message: "Document and associated chat sessions and document chunks deleted successfully",
        });
    }
    catch (error) {
        req.log.error(error);
        return res
            .status(500)
            .json({ message: "Error deleting document", cause: error.message });
    }
};
/**
 * Fetches all documents by class for the current user (only those fully processed).
 * Example route: GET /api/v1/class/:className/documents
 */
export const getDocumentsByClass = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: "User not registered or token malfunctioned" });
        }
        const { className } = req.params;
        if (!className) {
            return res.status(400).json({ message: "Missing 'className' in URL" });
        }
        // ⚠️  new: return *all* docs, flag tells UI if still processing
        const docs = await Document.find({
            userId: currentUser._id,
            className: decodeURIComponent(className).trim(),
        }).sort({ uploadedAt: -1 });
        return res.status(200).json(docs);
    }
    catch (error) {
        req.log.error(error);
        return res
            .status(500)
            .json({ message: "Error fetching documents by class", cause: error.message });
    }
};
/**
 * Get the stored document summary directly from database
 * Returns the raw summary text without LLM processing
 */
export const getDocumentSummary = async (req, res, next) => {
    try {
        const userId = res.locals.jwtData?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { docId } = req.params;
        if (!docId) {
            return res.status(400).json({ message: "Document ID is required" });
        }
        // Find the document to verify ownership and get MongoDB _id
        let document = null;
        if (mongoose.Types.ObjectId.isValid(docId)) {
            document = await Document.findOne({
                _id: docId,
                userId: new mongoose.Types.ObjectId(userId),
            });
        }
        if (!document) {
            document = await Document.findOne({
                docId,
                userId: new mongoose.Types.ObjectId(userId),
            });
        }
        if (!document) {
            return res.status(404).json({ message: "Document not found" });
        }
        // Query study_materials2 collection for the stored summary
        const ChunkModel = await getChunkModel();
        const summary = await ChunkModel.findOne({
            user_id: userId,
            doc_id: document._id.toString(),
            is_summary: true,
        });
        if (!summary) {
            return res.status(404).json({ message: "Summary not found for this document" });
        }
        // Return the raw stored summary text directly
        return res.status(200).json({
            success: true,
            summary: {
                content: summary.text,
            },
        });
    }
    catch (error) {
        console.error("Error fetching document summary:", error);
        return res
            .status(500)
            .json({ message: "Error fetching document summary", cause: error.message });
    }
};
//# sourceMappingURL=document_controllers.js.map