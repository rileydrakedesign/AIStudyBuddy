import { body, param, query, validationResult } from "express-validator";
import Document from "../models/documents.js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();
// Existing validators
export const validate = (validations) => {
    return async (req, res, next) => {
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
/* ----------------------------------------------------------
   EMAIL & PASSWORD
---------------------------------------------------------- */
const emailValidator = body("email")
    .trim()
    .isEmail()
    .withMessage("Valid email is required")
    .normalizeEmail();
const passwordValidator = body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Za-z]/)
    .withMessage("Password must contain at least one letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one number");
export const loginValidator = [emailValidator, passwordValidator];
export const signupValidator = [
    // First & last names come in as firstName / lastName from the new form
    body("firstName")
        .trim()
        .notEmpty()
        .withMessage("First name is required")
        .isAlpha("en-US", { ignore: " " })
        .withMessage("First name must contain only letters"),
    body("lastName")
        .trim()
        .notEmpty()
        .withMessage("Last name is required")
        .isAlpha("en-US", { ignore: " " })
        .withMessage("Last name must contain only letters"),
    // Optional school
    body("school")
        .optional()
        .isString()
        .isLength({ max: 100 })
        .withMessage("School must be under 100 characters"),
    emailValidator,
    passwordValidator,
    // Confirm password matches
    body("confirmPassword")
        .custom((value, { req }) => value === req.body.password)
        .withMessage("Passwords do not match"),
];
/* ----------------------------------------------------------
   PASSWORD RESET
---------------------------------------------------------- */
export const forgotPasswordValidator = [emailValidator];
export const resetPasswordValidator = [
    body("token").trim().notEmpty().withMessage("Reset token is required"),
    passwordValidator,
    body("confirmPassword")
        .custom((value, { req }) => value === req.body.password)
        .withMessage("Passwords do not match"),
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
export const handleChatCompletionValidation = (req, res, next) => {
    // Log the raw incoming body
    req.log.debug({ body: req.body }, "Incoming /chat/new request body");
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        // If there's a validation error, log it out
        req.log.debug({ errors: errors.array() }, "Validation errors");
        return res.status(422).json({ errors: errors.array() });
    }
    // No errors; proceed to the next middleware/controller
    next();
};
/**
 * NEW: duplicateDocumentValidator
 *
 * This middleware checks each uploaded file (in req.files) to ensure that a document
 * with the same fileName does not already exist under the same class for the current user.
 * If a duplicate is detected, it iterates over all files in the request and deletes them
 * from S3 before returning a 409 error.
 */
export const duplicateDocumentValidator = async (req, res, next) => {
    try {
        // If no files were uploaded, proceed to next middleware
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
            return next();
        }
        const userId = res.locals.jwtData.id;
        // Use the same default ("General") that is applied later in uploadDocument if not provided
        const className = req.body.className || "General";
        // Check each file for duplicates by fileName for the current user and specified class
        for (const file of req.files) {
            const existingDoc = await Document.findOne({
                userId,
                fileName: file.originalname,
                className
            });
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
                    if (f.key) {
                        try {
                            await s3.send(new DeleteObjectCommand({
                                Bucket: process.env.AWS_S3_BUCKET_NAME,
                                Key: f.key,
                            }));
                        }
                        catch (deleteError) {
                            req.log.error({ err: deleteError, s3Key: f.key }, "Error deleting duplicate file from S3");
                        }
                    }
                }
                return res.status(409).json({ message: "Document already exists in class" });
            }
        }
        next();
    }
    catch (error) {
        req.log.error(error, "Error in duplicateDocumentValidator");
        return res
            .status(500)
            .json({ message: "Server error in duplicate document check" });
    }
};
//# sourceMappingURL=validators.js.map