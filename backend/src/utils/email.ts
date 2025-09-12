import Mailgun from "mailgun.js";
import formData from "form-data";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const mg = new Mailgun(formData).client({
  username: "api",
  key: process.env.MAILGUN_API_KEY as string,
});

const canSendEmail = () => {
  const enabled = (process.env.EMAIL_ENABLED ?? "true").toLowerCase() !== "false";
  const hasKey = !!process.env.MAILGUN_API_KEY;
  const hasDomain = !!process.env.MAILGUN_DOMAIN;
  return enabled && hasKey && hasDomain;
};

export const sendConfirmEmail = async (user) => {
  user.emailToken    = crypto.randomBytes(20).toString("hex");
  user.emailTokenExp = Date.now() + 24 * 60 * 60 * 1000;  // 24 h
  user.confirmEmailSentAt = new Date(); 
  await user.save();

  const base = process.env.BACKEND_URL || process.env.BACKEND_URL_DEV || "";
  const url = `${base}/confirm/${user.emailToken}`;

  if (!canSendEmail()) {
    console.warn("[email] Skipping confirm email — EMAIL_ENABLED false or Mailgun not configured");
    return;
  }

  await mg.messages.create(process.env.MAILGUN_DOMAIN as string, {
    from: "ClassChat <no-reply@classchat.ai>",
    to: user.email,
    subject: "Confirm your email",
    html: `
      <p>Hi ${user.firstName ?? user.name.split(" ")[0]},</p>
      <p>Please confirm your email:</p>
      <a href="${url}"
         style="background:#1976d2;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-weight:600">
        Confirm Email
      </a>
      <p>If the button doesn’t work, copy this link:</p>
      <p>${url}</p>`,
  });
};

export const sendPasswordResetEmail = async (user) => {
  // issue a short‑lived (e.g., 1 hour) reset token
  user.passwordResetToken   = crypto.randomBytes(20).toString("hex");
  user.passwordResetExp     = new Date(Date.now() + 60 * 60 * 1000);
  user.passwordResetSentAt  = new Date();
  await user.save();

  // Build a backend public URL for redirect handler
  const backendBase = process.env.BACKEND_URL || process.env.BACKEND_URL_DEV || "";
  const url = `${backendBase}/reset/${user.passwordResetToken}`;

  if (!canSendEmail()) {
    console.warn("[email] Skipping reset email — EMAIL_ENABLED false or Mailgun not configured");
    return;
  }

  await mg.messages.create(process.env.MAILGUN_DOMAIN as string, {
    from: "ClassChat <no-reply@classchat.ai>",
    to: user.email,
    subject: "Reset your password",
    html: `
      <p>Hi ${user.firstName ?? user.name?.split(" ")?.[0] ?? "there"},</p>
      <p>We received a request to reset your password. Click the button below to set a new one.</p>
      <a href="${url}"
         style="background:#1976d2;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-weight:600">
        Reset Password
      </a>
      <p>If the button doesn’t work, copy this link:</p>
      <p>${url}</p>
      <p>If you didn’t request this, you can safely ignore this email.</p>
    `,
  });
};
