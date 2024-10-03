import { NextFunction, Request, Response } from "express";
import { body, param, ValidationChain, validationResult } from "express-validator";

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
    body("email").trim().isEmail().withMessage("Email is required"), 
    body("password") //for password add validation for contains special characters and 1 upper case
      .trim()
      .isLength({ min: 6 })
      .withMessage("Password should contain atleast 6 characters"),
      //polish off error messages to be more descriptive 
];

export const signupValidator = [
    body("name").notEmpty().withMessage("Name is required"),
    ...loginValidator,
];

export const chatCompletionValidator = [
  body("message").notEmpty().withMessage("Message  is required"),
];


export const documentUploadValidator = [
  body("className").optional().isString().withMessage("Class Name must be a string"),
  // Add other validations if needed
];

export const objectIdValidator = [
  param('id').isMongoId().withMessage('Invalid document ID'),
];

