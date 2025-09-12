import { Request, Response } from "express";
import { hash } from "bcrypt";
import User from "../models/user.js";
import { sendPasswordResetEmail } from "../utils/email.js";

/* ------------------------------------------------------------
   POST /api/v1/user/forgot-password
   Always responds 200 to avoid enumeration
------------------------------------------------------------ */
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return res.status(200).json({ message: "If the account exists, we sent a reset link" });

    const found = await User.findOne({ email });
    if (found) {
      // rudimentary server-side cooldown (60s)
      const now = Date.now();
      if (found.passwordResetSentAt && now - found.passwordResetSentAt.getTime() < 60_000) {
        // noop, but still respond 200 below
      } else {
        await sendPasswordResetEmail(found);
      }
    }
    return res.status(200).json({ message: "If the account exists, we sent a reset link" });
  } catch (error: any) {
    (req as any).log?.error(error, "forgotPassword error");
    return res.status(200).json({ message: "If the account exists, we sent a reset link" });
  }
};

/* ------------------------------------------------------------
   POST /api/v1/user/reset-password
   Body: { token, password }
------------------------------------------------------------ */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) return res.status(422).json({ message: "Invalid request" });

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExp: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset link" });
    }

    user.password = await hash(password, 10);
    user.passwordResetToken = undefined as any;
    user.passwordResetExp   = undefined as any;
    user.passwordResetSentAt= undefined as any;
    await user.save();

    return res.status(200).json({ message: "Password has been reset" });
  } catch (error: any) {
    (req as any).log?.error(error, "resetPassword error");
    return res.status(500).json({ message: "Failed to reset password" });
  }
};

/* ------------------------------------------------------------
   GET /reset/:token → redirect to frontend reset screen
------------------------------------------------------------ */
export const resetRedirect = async (req: Request, res: Response) => {
  const token = req.params.token;
  const fe =
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : undefined) ||
    'https://app.classchatai.com';
  const url = `${fe}/reset-password?token=${encodeURIComponent(token)}`;
  return res.redirect(302, url);
};

