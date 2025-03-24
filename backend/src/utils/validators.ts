import { NextFunction, Request, Response } from "express";
import { body, param, query, ValidationChain, validationResult } from "express-validator";
import Document from "../models/documents.js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

// Existing validators
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (let validation of validations) {
      const result = await validation.run(req);
      if (!result.isEmpty()) {
        break;
      }
    }
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    return res.status(422).json({ errors: errors.array() });
  };
};

export const loginValidator = [
  body("email").trim().isEmail().withMessage("Valid email is required"),
  body("password")
    .trim()
    .isLength({ min: 6 })
    .withMessage("Password should contain at least 6 characters"),
];

export const signupValidator = [
  body("name").notEmpty().withMessage("Name is required"),
  ...loginValidator,
];

export const chatCompletionValidator = [
  body("message")
    .notEmpty()
    .withMessage("Message is required"),
  body("class_name")
    .optional()
    .isString()
    .withMessage("Class name must be a string"),
  body("chatSessionId")
    .optional()
    .isString()
    .withMessage("Invalid chat session ID"),
  // NEW: optional docId must be a string if provided
  body("docId")
    .optional()
    .isString()
    .withMessage("docId must be a string"),
  // NEW: optional ephemeral must be boolean if provided
  body("ephemeral")
    .optional()
    .isBoolean()
    .withMessage("ephemeral must be a boolean"),
];

export const chatSessionValidator = [
  body("name")
    .optional()
    .isString()
    .withMessage("Session name must be a string"),
];

export const chatSessionIdValidator = [
  param('chatSessionId')
    .isString()
    .withMessage('Invalid chat session ID'),
];

export const documentUploadValidator = [
  body("className")
    .optional()
    .isString()
    .withMessage("Class name must be a string"),
];

export const objectIdValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid document ID'),
];

export const downloadValidator = [
  query("s3_key")
    .notEmpty()
    .withMessage("s3_key query parameter is required")
    .isString()
    .withMessage("s3_key must be a string"),
];

export const handleChatCompletionValidation = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log the raw incoming body
  console.log("Incoming /chat/new request body =>", req.body);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // If there's a validation error, log it out
    console.log("Validation errors =>", errors.array());
    return res.status(422).json({ errors: errors.array() });
  }
  // No errors; proceed to the next middleware/controller
  next();
};

/**
 * NEW: duplicateDocumentValidator
 * 
 * This middleware checks each uploaded file (in req.files) to ensure that a document with the same
 * fileName does not already exist in the database for the current user. If a duplicate is detected,
 * it iterates over all files in the request and deletes them from S3 before returning a 409 error.
 */
export const duplicateDocumentValidator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // If no files were uploaded, proceed to next middleware
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return next();
    }

    const userId = res.locals.jwtData.id;

    // Check each file for duplicates by fileName for the current user
    for (const file of req.files) {
      const existingDoc = await Document.findOne({ userId, fileName: file.originalname });
      if (existingDoc) {
        // Create an S3 client to remove the uploaded files
        const s3 = new S3Client({
          region: process.env.AWS_REGION,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY,
            secretAccessKey: process.env.AWS_SECRET,
          },
        });

        // Remove all files uploaded in this request from S3
        for (const f of req.files) {
          if ((f as any).key) {
            try {
              await s3.send(new DeleteObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: (f as any).key,
              }));
            } catch (deleteError) {
              console.error("Error deleting duplicate file from S3", (f as any).key, deleteError);
            }
          }
        }
        return res.status(409).json({ message: "Document already exists in class" });
      }
    }
    next();
  } catch (error) {
    console.error("Error in duplicateDocumentValidator:", error);
    return res.status(500).json({ message: "Server error in duplicate document check" });
  }
};
