import { NextFunction, Request, Response } from "express";
import { body, param, query, ValidationChain, validationResult } from "express-validator";

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