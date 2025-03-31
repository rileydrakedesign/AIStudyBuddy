import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import Document, { IDocument } from "../models/documents.js";
import User from "../models/user.js";
import ChatSession from "../models/chatSession.js";
import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const bucketName = process.env.AWS_S3_BUCKET_NAME!;
const region = process.env.AWS_REGION!;
const accessKeyId = process.env.AWS_ACCESS_KEY!;
const secretAccessKey = process.env.AWS_SECRET!;

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
async function uploadFileToS3(
  fileBuffer: Buffer,
  fileName: string,
  mimetype: string
) {
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
async function deleteFileFromS3(fileName: string) {
  const deleteParams = {
    Bucket: bucketName,
    Key: fileName,
  };

  await s3Client.send(new DeleteObjectCommand(deleteParams));
}

// Function to get pre-signed URL for an object
async function getObjectSignedUrl(key: string) {
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
 * Uploads a document, stores it in MongoDB, and calls the Python script
 * `load_data.py` with the actual Mongo `_id` via --doc_id argument. 
 */
export const uploadDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .json({ message: "User not registered or token malfunctioned" });
    }

    const userId = currentUser._id.toString();
    const files = req.files as Express.Multer.File[];
    const className = req.body.className || "General";

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Ensure the class is added if it doesn't exist
    const classExists = currentUser.classes.some(
      (cls) => cls.name === className
    );
    if (!classExists) {
      currentUser.classes.push({ name: className });
      await currentUser.save();
      console.log(`Added class '${className}' to user ${userId}`);
    }

    const uploadedDocs: IDocument[] = [];
    let completedCount = 0;

    for (const file of files) {
      if (!file) {
        console.log("A file was missing, skipping...");
        completedCount++;
        continue;
      }

      console.log("File details:", {
        originalname: file.originalname,
        mimetype: file.mimetype,
      });

      const s3Key = (file as any).key;
      const s3Url = (file as any).location;

      if (!s3Key || !s3Url) {
        console.warn(
          "file.key or file.location missing, using fallback keys/URLs."
        );
      }

      console.log("S3 key from multer-s3:", s3Key);
      console.log("S3 URL:", s3Url);

      // Create a new Document record in MongoDB
      const newDocument = new Document({
        userId: userId,
        fileName: file.originalname,
        uploadedAt: Date.now(),
        s3Key: s3Key || `fallbackKey-${file.originalname}`,
        s3Url: s3Url || `https://...fallbackUrl.../${file.originalname}`,
        className: className,
      }) as IDocument;

      await newDocument.save();
      console.log("Stored file meta in mongodb:", newDocument._id);

      const pythonPath = process.env.PYTHON_PATH || "python";
      const scriptPath =
        "/Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts/load_data.py";

      console.log("Executing Python script:", { pythonPath, scriptPath });
      const options = {
        env: {
          ...process.env,
          MONGO_CONNECTION_STRING: process.env.MONGO_CONNECTION_STRING,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY,
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET,
          AWS_REGION: process.env.AWS_REGION,
          AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
          OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        },
      };

      // Pass the actual Mongo _id into the script
      execFile(
        pythonPath,
        [
          scriptPath,
          "--user_id",
          userId,
          "--class_name",
          className,
          "--s3_key",
          s3Key || "",
          "--doc_id",
          newDocument._id.toString(),
        ],
        options,
        async (error, stdout, stderr) => {
          if (error) {
            console.error(`Exec error: ${error}`);
          } else {
            console.log(`Python stdout: ${stdout}`);
            console.error(`Python stderr: ${stderr}`);
          }

          uploadedDocs.push(newDocument);
          completedCount++;

          if (completedCount === files.length) {
            return res.status(200).json({
              message: "All files uploaded and processed successfully",
              documents: uploadedDocs,
            });
          }
        }
      );
    }
    // No final return here; we respond after the last file is processed
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Returns all documents for the current user.
 */
export const getUserDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .json({ message: "User not registered or token malfunctioned" });
    }

    const documents = await Document.find({ userId: currentUser._id });
    return res.status(200).json({ message: "OK", documents });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Retrieves a pre-signed URL for the given document ID (PDF or otherwise).
 */
export const getDocumentFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .json({ message: "User not registered or token malfunctioned" });
    }

    const documentId = req.params.id;
    const document = (await Document.findById(documentId)) as IDocument | null;

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    // Ensure this doc belongs to the authenticated user
    if (document.userId.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    let responseType: string | undefined = undefined;
    if (document.fileName?.toLowerCase().endsWith(".pdf")) {
      responseType = "application/pdf";
    }

    // Build a GetObjectCommand with inline disposition override
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: document.s3Key,
      ResponseContentDisposition: "inline",
      ResponseContentType: responseType,
    });

    // Generate a short-lived pre-signed URL
    const url = await getSignedUrl(s3Client, command, { expiresIn: 120 });
    return res.status(200).json({ url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Deletes a document (both from S3 and from MongoDB) and cascades deletion:
 * - Removes chat sessions referencing this document.
 * - Removes processed document chunks stored in "study_materials2".
 */
export const deleteDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const currentUser = await User.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .json({ message: "User not registered or token malfunctioned" });
    }

    const documentId = req.params.id;
    const document = (await Document.findById(documentId)) as IDocument | null;

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
    await ChatSession.deleteMany({ userId: currentUser._id, assignedDocument: documentId });

    // Cascade deletion: Remove processed document chunks from "study_materials2"
    // <-- Updated code starts here -->
    const db = mongoose.connection.useDb("study_buddy_demo");
    const studyMaterialsCollection = db.collection("study_materials2");
    await studyMaterialsCollection.deleteMany({ "doc_id": documentId });
    // <-- Updated code ends here -->

    return res.status(200).json({ message: "Document and associated chat sessions and document chunks deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting document:", error);
    return res.status(500).json({ message: "Error deleting document", cause: error.message });
  }
};

/**
 * Fetches all documents by class for the current user.
 * Example route: GET /api/v1/class/:className/documents
 */
export const getDocumentsByClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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

    const docs = await Document.find({
      userId: currentUser._id,
      className: decodeURIComponent(className).trim(),
    }).sort({ uploadedAt: -1 });

    return res.status(200).json(docs);
  } catch (error) {
    console.error("Error fetching documents by class:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch documents", error: String(error) });
  }
};
