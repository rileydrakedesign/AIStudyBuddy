import user from "../models/user.js";
import { sendConfirmEmail } from "../utils/email.js";

/* ------------------------------------------------------------------ */
/* 1)  GET /confirm/:token   → verify e‑mail and redirect to /chat   */
/* ------------------------------------------------------------------ */
export const confirmEmail = async (req, res) => {
  const found = await user.findOne({
    emailToken: req.params.token,
    emailTokenExp: { $gt: Date.now() },
  });

  if (!found) {
    return res.status(400).send("Invalid or expired confirmation link");
  }

  found.emailVerified = true;
  found.emailToken = undefined;
  found.emailTokenExp = undefined;
  await found.save();

  // Hard-code redirect to production app as before
  return res.redirect(302, "https://app.classchatai.com/chat");
};

/* ------------------------------------------------------------------ */
/*  POST /resend-confirmation   → send verification link again        */
/* ------------------------------------------------------------------ */
export const resendConfirmEmail = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });
  
    const found = await user.findOne({ email });
    if (!found) return res.status(404).json({ message: "User not found" });
    if (found.emailVerified)
      return res.status(400).json({ message: "Already verified" });
  
    // ── 30‑second server‑side cooldown ───────────────────────────
    const now = Date.now();
    if (
      found.confirmEmailSentAt &&                      // field added to schema
      now - found.confirmEmailSentAt.getTime() < 30_000
    ) {
      return res
        .status(429)
        .json({ message: "Please wait before requesting another e‑mail." });
    }
  
    await sendConfirmEmail(found);                     // helper updates confirmEmailSentAt
    return res.status(200).json({ message: "Confirmation e‑mail sent" });
  };
  
