import user from "../models/user.js";
import { hash, compare } from "bcrypt";
import { createToken } from "../utils/token_manager.js";
import { COOKIE_NAME } from "../utils/constants.js";
import mongoose from "mongoose";
import Document from "../models/documents.js";
import ChatSession from "../models/chatSession.js";
import { sendConfirmEmail, sendEmailChangeVerification } from "../utils/email.js";
import { OAuth2Client } from "google-auth-library";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
export const getAllUsers = async (req, res, next) => {
    try {
        // get all users
        const users = await user.find();
        return res.status(200).json({ message: "OK", users });
    }
    catch (error) {
        req.log.error(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
export const userSignup = async (req, res, next) => {
    try {
        const { firstName, lastName, school, email, password } = req.body;
        const name = `${firstName} ${lastName}`.trim();
        const existingUser = await user.findOne({ email });
        if (existingUser)
            return res.status(409).json({ message: "User already registered" });
        const hashedPassword = await hash(password, 10);
        const newUser = new user({
            name,
            school, // optional
            email,
            password: hashedPassword,
        });
        await newUser.save();
        await sendConfirmEmail(newUser);
        /* ---------- auth cookie ---------- */
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            signed: true,
            path: "/",
        });
        const token = createToken(newUser._id.toString(), newUser.email, "7d");
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);
        res.cookie(COOKIE_NAME, token, {
            path: "/",
            expires,
            secure: true,
            sameSite: "none",
            httpOnly: true,
            signed: true,
        });
        return res.status(200).json({
            message: "OK",
            name: newUser.name,
            email: newUser.email,
        });
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
export const userLogin = async (req, res, next) => {
    try {
        // user login
        const { email, password } = req.body;
        const currentUser = await user.findOne({ email });
        if (!currentUser) {
            return res.status(401).json({ message: "User not registered" });
        }
        if (!currentUser.emailVerified) {
            return res
                .status(403)
                .json({ message: "Please confirm your email via the link we sent." });
        }
        const isPasswordCorrect = await compare(password, currentUser.password);
        if (!isPasswordCorrect) {
            return res.status(403).json({ message: "Incorrect password" });
        }
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            signed: true,
            path: "/",
        });
        const token = createToken(currentUser._id.toString(), currentUser.email, "7d");
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);
        res.cookie(COOKIE_NAME, token, {
            path: "/",
            expires,
            secure: true,
            sameSite: "none",
            httpOnly: true,
            signed: true,
        });
        return res
            .status(200)
            .json({ message: "OK", name: currentUser.name, email: currentUser.email });
    }
    catch (error) {
        req.log.error(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
/* ------------------------------------------------------------
   Google Sign-In: verify ID token and upsert user
------------------------------------------------------------ */
export const googleAuth = async (req, res, next) => {
    try {
        const { credential } = req.body;
        // Basic request diagnostics (safe)
        try {
            req.log?.info({
                route: "/user/google",
                origin: req.headers.origin,
                hasCredential: !!credential,
                credPrefix: credential ? credential.slice(0, 12) : undefined,
                envHasClientId: !!process.env.GOOGLE_CLIENT_ID,
            }, "Google auth request");
        }
        catch { }
        if (!credential) {
            return res.status(400).json({ message: "Missing Google credential" });
        }
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            return res.status(500).json({ message: "Server misconfigured (no GOOGLE_CLIENT_ID)" });
        }
        const oauthClient = new OAuth2Client(clientId);
        const ticket = await oauthClient.verifyIdToken({ idToken: credential, audience: clientId });
        const payload = ticket.getPayload();
        if (!payload) {
            return res.status(401).json({ message: "Invalid Google token" });
        }
        const email = payload.email;
        const emailVerified = payload.email_verified;
        const name = payload.name || `${payload.given_name ?? ""} ${payload.family_name ?? ""}`.trim();
        const googleId = payload.sub;
        const picture = payload.picture;
        if (!email) {
            return res.status(400).json({ message: "Google profile missing e‑mail" });
        }
        let existingUser = await user.findOne({ email });
        if (!existingUser) {
            existingUser = new user({
                name: name || email.split("@")[0],
                email,
                authProvider: "google",
                googleId,
                picture,
                emailVerified: !!emailVerified,
            });
            await existingUser.save();
        }
        else {
            let changed = false;
            if (!existingUser.emailVerified && emailVerified) {
                existingUser.emailVerified = true;
                changed = true;
            }
            if (!existingUser.googleId && googleId) {
                existingUser.googleId = googleId;
                changed = true;
            }
            if (existingUser.authProvider !== "google") {
                existingUser.authProvider = "google";
                changed = true;
            }
            if (picture && !existingUser.picture) {
                existingUser.picture = picture;
                changed = true;
            }
            if (changed)
                await existingUser.save();
        }
        /* ---------- auth cookie ---------- */
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            signed: true,
            path: "/",
        });
        const token = createToken(existingUser._id.toString(), existingUser.email, "7d");
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);
        res.cookie(COOKIE_NAME, token, {
            path: "/",
            expires,
            secure: true,
            sameSite: "none",
            httpOnly: true,
            signed: true,
        });
        req.log?.info({ userId: existingUser._id, email: existingUser.email }, "Google auth success");
        return res
            .status(200)
            .json({ message: "OK", name: existingUser.name, email: existingUser.email });
    }
    catch (error) {
        req.log?.error({ err: error, msg: error?.message }, "Google auth failed");
        return res.status(401).json({ message: "Google authentication failed", cause: error?.message });
    }
};
export const verifyUser = async (req, res, next) => {
    try {
        // Prevent caching so the client always gets fresh data
        res.set("Cache-Control", "no-store");
        const currentUser = await user.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .send("User not registered OR Token malfunctioned");
        }
        if (currentUser._id.toString() !== res.locals.jwtData.id) {
            return res.status(401).send("Permissions didn't match");
        }
        return res.status(200).json({
            message: "OK",
            name: currentUser.name,
            email: currentUser.email,
            emailVerified: currentUser.emailVerified,
            plan: currentUser.plan,
            chatRequestCount: currentUser.chatRequestCount,
        });
    }
    catch (error) {
        req.log.error(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
export const getUserClasses = async (req, res) => {
    try {
        const currentUser = await user.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: "User not registered or token malfunctioned" });
        }
        const userClasses = currentUser.classes || [];
        return res.status(200).json({ classes: userClasses });
    }
    catch (error) {
        req.log.error(error);
        return res
            .status(500)
            .json({ message: "Failed to fetch user classes" });
    }
};
/* ------------------------------------------------------------
   deleteUserClass  (no cookie operations here – untouched)
------------------------------------------------------------ */
export const deleteUserClass = async (req, res) => {
    try {
        const currentUser = await user.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res.status(401).send("User not registered or token malfunctioned");
        }
        const { classId } = req.params;
        const classToDelete = currentUser.classes.find((cls) => cls._id.toString() === classId);
        if (!classToDelete) {
            return res.status(404).json({ message: "Class not found" });
        }
        const className = classToDelete.name;
        currentUser.classes.pull({ _id: classId });
        await currentUser.save();
        await Document.deleteMany({
            userId: currentUser._id,
            className: className,
        });
        await ChatSession.deleteMany({
            userId: currentUser._id,
            assignedClass: className,
        });
        const db = mongoose.connection.useDb("study_buddy_demo");
        const studyMaterialsCollection = db.collection("study_materials2");
        await studyMaterialsCollection.deleteMany({
            user_id: currentUser._id.toString(),
            class_id: className,
        });
        return res
            .status(200)
            .json({
            message: "Class and associated documents, chat sessions, and document chunks deleted successfully",
        });
    }
    catch (error) {
        req.log.error({ err: error }, "Error deleting class");
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
export const userLogout = async (req, res, next) => {
    try {
        // user token check
        const currentUser = await user.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .send("User not registered OR Token malfunctioned");
        }
        if (currentUser._id.toString() !== res.locals.jwtData.id) {
            return res.status(401).send("Permissions didn't match");
        }
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            signed: true,
            path: "/",
        });
        return res
            .status(200)
            .json({ message: "OK", name: currentUser.name, email: currentUser.email });
    }
    catch (error) {
        req.log.error(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
/* ------------------------------------------------------------
   PUT /api/v1/user/email
   Request email change - requires current password
------------------------------------------------------------ */
export const requestEmailChange = async (req, res, next) => {
    try {
        const { newEmail, currentPassword } = req.body;
        const userId = res.locals.jwtData?.id;
        if (!userId)
            return res.status(401).json({ message: "Unauthorized" });
        if (!newEmail || !currentPassword) {
            return res.status(400).json({ message: "New email and current password required" });
        }
        const currentUser = await user.findById(userId);
        if (!currentUser) {
            return res.status(401).json({ message: "User not found" });
        }
        // Verify current password (skip for Google auth users)
        if (currentUser.authProvider === "credentials") {
            const isPasswordCorrect = await compare(currentPassword, currentUser.password);
            if (!isPasswordCorrect) {
                return res.status(403).json({ message: "Incorrect password" });
            }
        }
        // Check if new email already exists
        const existingUser = await user.findOne({ email: newEmail });
        if (existingUser) {
            return res.status(409).json({ message: "Email already in use" });
        }
        // Send verification email to new address
        await sendEmailChangeVerification(currentUser, newEmail);
        req.log?.info({ userId, newEmail }, "Email change verification sent");
        return res.status(200).json({
            message: `Verification email sent to ${newEmail}. Please verify to complete the change.`
        });
    }
    catch (error) {
        req.log?.error(error, "requestEmailChange error");
        return res.status(500).json({ message: "Failed to process email change request" });
    }
};
/* ------------------------------------------------------------
   GET /api/v1/user/email/verify/:token
   Verify email change and update user email
------------------------------------------------------------ */
export const verifyEmailChange = async (req, res, next) => {
    try {
        const { token } = req.params;
        const currentUser = await user.findOne({
            emailChangeToken: token,
            emailChangeTokenExp: { $gt: new Date() },
        });
        if (!currentUser || !currentUser.pendingEmail) {
            const fe = process.env.FRONTEND_URL ||
                (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : 'https://app.classchatai.com');
            return res.redirect(302, `${fe}/profile?emailChangeError=invalid`);
        }
        // Update email and clear pending fields
        currentUser.email = currentUser.pendingEmail;
        currentUser.pendingEmail = undefined;
        currentUser.emailChangeToken = undefined;
        currentUser.emailChangeTokenExp = undefined;
        await currentUser.save();
        // Clear JWT cookie to force re-login with new email
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            signed: true,
            path: "/",
        });
        req.log?.info({ userId: currentUser._id, newEmail: currentUser.email }, "Email change verified");
        // Redirect to login with success message
        const fe = process.env.FRONTEND_URL ||
            (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : 'https://app.classchatai.com');
        return res.redirect(302, `${fe}/login?emailChanged=true`);
    }
    catch (error) {
        req.log?.error(error, "verifyEmailChange error");
        const fe = process.env.FRONTEND_URL ||
            (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : 'https://app.classchatai.com');
        return res.redirect(302, `${fe}/profile?emailChangeError=failed`);
    }
};
/* ------------------------------------------------------------
   DELETE /api/v1/user/account
   Delete user account and all associated data
------------------------------------------------------------ */
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET,
    },
});
export const deleteAccount = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const userId = res.locals.jwtData?.id;
        if (!userId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ message: "Unauthorized" });
        }
        const currentUser = await user.findById(userId).session(session);
        if (!currentUser) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ message: "User not found" });
        }
        req.log?.info({ userId }, "Starting account deletion");
        // 1. Delete all chat sessions
        await ChatSession.deleteMany({ userId: new mongoose.Types.ObjectId(userId) }, { session });
        req.log?.info({ userId }, "Deleted chat sessions");
        // 2. Delete all documents and S3 objects
        const documents = await Document.find({ userId: new mongoose.Types.ObjectId(userId) }).session(session);
        const bucketName = process.env.AWS_S3_BUCKET_NAME;
        for (const doc of documents) {
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: bucketName,
                    Key: doc.s3Key,
                }));
                req.log?.info({ userId, s3Key: doc.s3Key }, "Deleted S3 object");
            }
            catch (s3Error) {
                req.log?.error({ userId, s3Key: doc.s3Key, error: s3Error }, "Failed to delete S3 object");
                // Continue deletion even if S3 delete fails (object might not exist)
            }
        }
        await Document.deleteMany({ userId: new mongoose.Types.ObjectId(userId) }, { session });
        req.log?.info({ userId }, "Deleted documents");
        // 3. Delete chunks from study_materials2 collection
        const db = mongoose.connection.useDb("study_buddy_demo");
        const studyMaterialsCollection = db.collection("study_materials2");
        await studyMaterialsCollection.deleteMany({ user_id: userId });
        req.log?.info({ userId }, "Deleted study materials");
        // 4. Delete user
        await user.deleteOne({ _id: userId }, { session });
        req.log?.info({ userId }, "Deleted user record");
        await session.commitTransaction();
        session.endSession();
        // Clear JWT cookie
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            signed: true,
            path: "/",
        });
        return res.status(200).json({ message: "Account deleted successfully" });
    }
    catch (error) {
        await session.abortTransaction();
        session.endSession();
        req.log?.error({ error, userId: res.locals.jwtData?.id }, "deleteAccount error");
        return res.status(500).json({ message: "Failed to delete account" });
    }
};
//# sourceMappingURL=user_controllers.js.map