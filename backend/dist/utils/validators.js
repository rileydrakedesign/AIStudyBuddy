import { body, param, query, validationResult } from "express-validator";
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
//# sourceMappingURL=validators.js.map