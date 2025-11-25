import { Router } from "express";
import { S3Client } from "@aws-sdk/client-s3";
import multerS3 from "multer-s3";
import multer from "multer";
import dotenv from "dotenv";
// Utility imports
import { verifyToken } from "../utils/token_manager.js";
import { documentUploadValidator, duplicateDocumentValidator, fileTypeValidator, validate } from "../utils/validators.js";
// Controller imports
import { uploadDocument, getUserDocuments, getDocumentFile, deleteDocument, getDocumentsByClass, getDocumentSummary, } from "../controllers/document_controllers.js";
dotenv.config();
// Initialize the S3 client
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET,
    },
});
/**
 * We configure multer-s3 so that each uploaded file
 * is set to "inline" Content-Disposition in S3.
 * This helps with in-browser viewing.
 *
 * CHANGE / ADDITION: A 'limits' object is passed to multer
 * to enforce a fileSize restriction. (Here set to ~200MB).
 */
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_S3_BUCKET_NAME,
        acl: "private",
        // Key part for inline viewing:
        contentDisposition: "inline",
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            // Generate a distinct key for each file
            const timestamp = Date.now();
            const sanitizedOriginalName = file.originalname.replace(/\s+/g, "_");
            const s3Key = `${timestamp}_${sanitizedOriginalName}`;
            // If needed, store them on req.body for later reference
            if (!req.body.s3KeyList) {
                req.body.s3KeyList = [];
            }
            req.body.s3KeyList.push(s3Key);
            cb(null, s3Key);
        },
    }),
    // NEW: File type filtering at Multer level
    fileFilter: function (req, file, cb) {
        const allowedMimeTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Only PDF and DOCX files are allowed. Received: ${file.mimetype}`));
        }
    },
    // NEW: Limit file size to prevent overly large uploads
    limits: {
        fileSize: 200 * 1024 * 1024, // 200MB
    },
});
// Create a router instance
const documentRoutes = Router();
/***************************************************************************
 * POST /documents/upload
 * Upload a new document (up to 10 files at once)
 ***************************************************************************/
documentRoutes.post("/upload", validate(documentUploadValidator), verifyToken, upload.array("files", 10), fileTypeValidator, // NEW: Validate file types (defense in depth)
duplicateDocumentValidator, // Check for duplicate files after upload
uploadDocument);
/***************************************************************************
 * GET /documents/all-documents
 * Retrieve all documents for the authenticated user
 ***************************************************************************/
documentRoutes.get("/all-documents", verifyToken, getUserDocuments);
/***************************************************************************
 * GET /documents/:id/file
 * Retrieve a presigned URL to view a specific document (inline)
 ***************************************************************************/
documentRoutes.get("/:id/file", verifyToken, getDocumentFile);
/***************************************************************************
 * DELETE /documents/delete/:id
 * Delete a specific document (S3 + DB)
 ***************************************************************************/
documentRoutes.delete("/delete/:id", verifyToken, deleteDocument);
/***************************************************************************
 * GET /documents/get/:className
 * Retrieve documents for a specific class
 ***************************************************************************/
documentRoutes.get("/get/:className", verifyToken, getDocumentsByClass);
/***************************************************************************
 * GET /documents/:docId/summary
 * Get the stored document summary directly from database
 ***************************************************************************/
documentRoutes.get("/:docId/summary", verifyToken, getDocumentSummary);
// Export the configured router
export default documentRoutes;
//# sourceMappingURL=document_routes.js.map