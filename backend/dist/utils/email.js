import Mailgun from "mailgun.js";
import formData from "form-data";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();
const mg = new Mailgun(formData).client({
    username: "api",
    key: process.env.MAILGUN_API_KEY,
});
export const sendConfirmEmail = async (user) => {
    user.emailToken = crypto.randomBytes(20).toString("hex");
    user.emailTokenExp = Date.now() + 24 * 60 * 60 * 1000; // 24 h
    await user.save();
    const url = `${process.env.BACKEND_URL}/confirm/${user.emailToken}`;
    await mg.messages.create(process.env.MAILGUN_DOMAIN, {
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
//# sourceMappingURL=email.js.map