import { NextFunction, Request, Response } from 'express';
import Document, { IDocument } from '../models/documents.js';
import User from '../models/user.js';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multerS3 from 'multer-s3';
import multer from 'multer';
import dotenv from 'dotenv';

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
export const uploadMiddleware = upload.single('file');

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
        .json({ message: 'User not registered or token malfunctioned' });
    }

    const userId = currentUser._id.toString();
    const file = req.file;
    const className = req.body.className || 'General';

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log("File details:", {
      originalname: file.originalname,
      mimetype: file.mimetype,
    });

    // Ensure the class is added to the user's classes if not already present
    const classExists = currentUser.classes.some(cls => cls.name === className);
    if (!classExists) {
      currentUser.classes.push({ name: className });
      await currentUser.save();
      console.log(`Added class '${className}' to user ${userId}`);
    }

    // Access s3Key from req.body
    const s3Key = req.body.s3Key;
    const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;

    console.log("S3 key from multer-s3:", s3Key);
    console.log("S3 URL:", s3Url);
    

    //upload to mongo
    const newDocument = new Document({
      userId: userId,
      fileName: file.originalname,
      uploadedAt: Date.now(),
      s3Key: s3Key,
      s3Url: s3Url,
      className: className,
    }) as IDocument;

    await newDocument.save();

    console.log("stored file meta in mongodb");


    // Call Python script to process the file
    const pythonPath = process.env.PYTHON_PATH || 'python'; // Path to Python executable
    const scriptPath = '/Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts/load_data.py';

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

    execFile(
      pythonPath,
      [
        scriptPath,
        '--user_id',
        userId,
        '--class_name',
        className,
        '--s3_key',
        s3Key,
        '--doc_id',          
        newDocument._id.toString(), 
      ],
      options,
      async (error, stdout, stderr) => {
        if (error) {
          console.error(`Exec error: ${error}`);
          return res.status(500).json({ message: 'Error processing file' });
        }

        console.log(`Python stdout: ${stdout}`);
        console.error(`Python stderr: ${stderr}`);

        // After processing, send a success response
        return res.status(200).json({
          message: 'File uploaded and processed successfully',
          document: newDocument,
        });
      }
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error ' });
  }
};

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
        .json({ message: 'User not registered or token malfunctioned' });
    }

    const documents = await Document.find({ userId: currentUser._id });

    return res.status(200).json({ message: 'OK', documents });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

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
        .json({ message: 'User not registered or token malfunctioned' });
    }

    const documentId = req.params.id;
    const document = (await Document.findById(documentId)) as IDocument | null;

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.userId.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Generate a pre-signed URL for the S3 object
    const url = await getObjectSignedUrl(document.s3Key);

    return res.status(200).json({ url });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

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
        .json({ message: 'User not registered or token malfunctioned' });
    }

    const documentId = req.params.id;
    const document = (await Document.findById(documentId)) as IDocument | null;

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (document.userId.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Delete the file from S3
    await deleteFileFromS3(document.s3Key);

    // Delete the document record from the database
    await Document.deleteOne({ _id: documentId });

    return res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    return res.status(500).json({ message: 'Error deleting file from S3' });
  }
};
