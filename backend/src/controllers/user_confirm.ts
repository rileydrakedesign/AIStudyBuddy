import user from "../models/user.js";

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

  return res.redirect(`${process.env.APP_BASE_URL}/login?verified=1`);
};
