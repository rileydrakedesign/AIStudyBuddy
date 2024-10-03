import { Router } from 'express';
import { verifyToken } from "../utils/token_manager.js";
import { documentUploadValidator, validate } from "../utils/validators.js";
import { uploadDocument, getUserDocuments, getDocumentFile, deleteDocument, } from "../controllers/document_controllers.js";
import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import multer from 'multer';
import dotenv from 'dotenv';
dotenv.config();
const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET,
    },
});
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_S3_BUCKET_NAME,
        acl: 'private',
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const timestamp = Date.now();
            const sanitizedOriginalName = file.originalname.replace(/\s+/g, '_');
            const s3Key = `${timestamp}_${sanitizedOriginalName}`;
            // Attach s3Key to req object
            req.body.s3Key = s3Key;
            cb(null, s3Key);
        },
    }),
});
// Create a router instance
const documentRoutes = Router();
// Protected API routes
// Route for uploading a new document
documentRoutes.post("/upload", validate(documentUploadValidator), verifyToken, upload.single("file"), //"file" denotes the form field name for file uploads
uploadDocument);
// Route for retrieving all documents of a user
documentRoutes.get("/all-documents", verifyToken, getUserDocuments);
// Route for retrieving a specific document file
documentRoutes.get("/:id/file", verifyToken, 
//validate(objectIdValidator),
getDocumentFile);
// Route for deleting a document
documentRoutes.delete("/delete/:id", verifyToken, 
//alidate(objectIdValidator),
deleteDocument);
export default documentRoutes;
//# sourceMappingURL=document_routes.js.map