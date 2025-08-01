import { NextFunction, Request, Response } from "express";
import user from "../models/user.js";
import { hash, compare } from "bcrypt";
import { createToken } from "../utils/token_manager.js";
import { COOKIE_NAME } from "../utils/constants.js";
import mongoose from "mongoose";
import Document from "../models/documents.js";
import ChatSession from "../models/chatSession.js";
import { sendConfirmEmail } from "../utils/email.js";

export const getAllUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // get all users
    const users = await user.find();
    return res.status(200).json({ message: "OK", users });
  } catch (error: any) {
    (req as any).log.error(error);
    return res.status(200).json({ message: "ERROR", cause: error.message });
  }  
};

export const userSignup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { firstName, lastName, school, email, password } = req.body;
    const name = `${firstName} ${lastName}`.trim();

    const existingUser = await user.findOne({ email });
    if (existingUser) return res.status(401).send("User already registered");

    const hashedPassword = await hash(password, 10);

    const newUser = new user({
      name,
      school,                // optional
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

    const token   = createToken(newUser._id.toString(), newUser.email, "7d");
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
      name:    newUser.name,
      email:   newUser.email,
    });
  } catch (error: any) {
    (req as any).log.error(error);
    return res.status(500).json({ message: "ERROR", cause: error.message });
  }
};


export const userLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // user login
    const { email, password } = req.body;
    const currentUser = await user.findOne({ email });
    if (!currentUser) {
      return res.status(401).send("User not registered");
    }
    if (!currentUser.emailVerified) {
        return res
          .status(403)
          .send("Please confirm your email via the link we sent.");
    }
    const isPasswordCorrect = await compare(password, currentUser.password);
    if (!isPasswordCorrect) {
      return res.status(403).send("Incorrect password");
    }

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      signed: true,
      path: "/",
    });

    const token = createToken(
      currentUser._id.toString(),
      currentUser.email,
      "7d"
    );
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
  } catch (error: any) {
    (req as any).log.error(error);
    return res.status(200).json({ message: "ERROR", cause: error.message });
  }
};

export const verifyUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
      name:  currentUser.name,
      email: currentUser.email,
      plan:  currentUser.plan,               
      chatRequestCount: currentUser.chatRequestCount, 
    });
  } catch (error: any) {
    (req as any).log.error(error);
    return res.status(200).json({ message: "ERROR", cause: error.message });
  }  
};


export const getUserClasses = async (req: Request, res: Response) => {
  try {
    const currentUser = await user.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res
        .status(401)
        .json({ message: "User not registered or token malfunctioned" });
    }

    const userClasses = currentUser.classes || [];
    return res.status(200).json({ classes: userClasses });
  } catch (error) {
    (req as any).log.error(error);
    return res
      .status(500)
      .json({ message: "Failed to fetch user classes" });
  }  
};

/* ------------------------------------------------------------
   deleteUserClass  (no cookie operations here – untouched)
------------------------------------------------------------ */
export const deleteUserClass = async (req: Request, res: Response) => {
  try {
    const currentUser = await user.findById(res.locals.jwtData.id);
    if (!currentUser) {
      return res.status(401).send("User not registered or token malfunctioned");
    }

    const { classId } = req.params;
    const classToDelete = currentUser.classes.find(
      (cls: any) => cls._id.toString() === classId
    );
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
      "metadata.class_id": className,
    });

    return res
      .status(200)
      .json({
        message:
          "Class and associated documents, chat sessions, and document chunks deleted successfully",
      });
  } catch (error: any) {
    (req as any).log.error({ err: error }, "Error deleting class");
    return res.status(500).json({ message: "ERROR", cause: error.message });
  } 
};

export const userLogout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
  } catch (error: any) {
    (req as any).log.error(error);
    return res.status(200).json({ message: "ERROR", cause: error.message });
  }    
};
