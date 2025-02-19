import { NextFunction, Request, Response } from "express";
import user from "../models/user.js";
import { hash, compare } from "bcrypt"
import { createToken } from "../utils/token_manager.js";
import { COOKIE_NAME } from "../utils/constants.js";
import mongoose from "mongoose";

export const getAllUsers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      //get all users
      const users = await user.find();
      return res.status(200).json({ message: "OK", users });
    } catch (error) {
      console.log(error);
      return res.status(200).json({ message: "ERROR", cause: error.message });
    }
  };

  export const userSignup = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      //user signup
      const { name, email, password } = req.body;
      const existingUser = await user.findOne({ email });
      if (existingUser) return res.status(401).send("User already registered");
      const hashedPassword = await hash(password, 10);
      const newUser = new user({ name, email, password: hashedPassword });
      await newUser.save();

      //create token and store cookie
      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: true,        
        sameSite: "none",
        domain: "localhost",
        signed: true,
        path: "/",
      });

      const token = createToken(newUser._id.toString(), newUser.email, "7d");
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);

      res.cookie(COOKIE_NAME, token, {
        path: "/",
        domain: "localhost",  
        expires,
        secure: true,        
        sameSite: "none",
        httpOnly: true,
        signed: true,
      });


      return res.status(200).json({ message: "OK", name: newUser.name, email: newUser.email });
    } catch (error) {
      console.log(error);
      return res.status(200).json({ message: "ERROR", cause: error.message });
    }
  };

  export const userLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      //user signup
      const { email, password } = req.body;
      const currentUser = await user.findOne({ email });
      if (!currentUser) {
        return res.status(401).send("User not registered")
      }
    const isPasswordCorrect = await compare(password, currentUser.password);
    if (!isPasswordCorrect) {
      return res.status(403).send("Incorrect password")
    }

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: true,        
      sameSite: "none",
      domain: "localhost",
      signed: true,
      path: "/",
    });

    const token = createToken(currentUser._id.toString(), currentUser.email, "7d");
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    res.cookie(COOKIE_NAME, token, {
      path: "/",
      domain: "localhost",  
      expires,
      secure: true,        
      sameSite: "none",
      httpOnly: true,
      signed: true,
    });

      return res.status(200).json({ message: "OK", name: currentUser.name, email: currentUser.email });
    } catch (error) {
      console.log(error);
      return res.status(200).json({ message: "ERROR", cause: error.message });
    }
  };

  export const verifyUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      //user token check
      const currentUser = await user.findById(res.locals.jwtData.id);
      if (!currentUser) {
        return res.status(401).send("User not registered OR Token malfunctioned");
      }
      //console.log(currentUser._id.toString(), res.locals.jwtData.id);

      if (currentUser._id.toString() !== res.locals.jwtData.id) {
        return res.status(401).send("Permissions didn't match");
      }
      return res
        .status(200)
        .json({ message: "OK", name: currentUser.name, email: currentUser.email });
    } catch (error) {
      console.log(error);
      return res.status(200).json({ message: "ERROR", cause: error.message });
    }
  };

  export const getUserClasses = async (req, res) => {
    try {
      const currentUser = await user.findById(res.locals.jwtData.id);
      if (!currentUser) {
        return res.status(401).json({ message: "User not registered or token malfunctioned" });
      }
  
      const userClasses = currentUser.classes || [];
      return res.status(200).json({ classes: userClasses });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to fetch user classes" });
    }
  };


  export const deleteUserClass = async (req: Request, res: Response) => {
    try {
      const currentUser = await user.findById(res.locals.jwtData.id);
      if (!currentUser) {
        return res.status(401).send("User not registered or token malfunctioned");
      }
  
      const { classId } = req.params;
  
      // Convert the string from the URL to an ObjectId
      const objectId = new mongoose.Types.ObjectId(classId);
  
      // Now .pull({ _id: ... }) will match the subdocument
      currentUser.classes.pull({ _id: objectId });
  
      await currentUser.save();
  
      return res.status(200).json({ message: "Class deleted" });
    } catch (error) {
      console.error("Error deleting class:", error);
      return res
        .status(500)
        .json({ message: "ERROR", cause: (error as Error).message });
    }
  };
  
  export const userLogout = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      //user token check
      const currentUser = await user.findById(res.locals.jwtData.id);
      if (!currentUser) {
        return res.status(401).send("User not registered OR Token malfunctioned");
      }
      if (currentUser._id.toString() !== res.locals.jwtData.id) {
        return res.status(401).send("Permissions didn't match");
      }
  
      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: true,        
        sameSite: "none",
        domain: "localhost",
        signed: true,
        path: "/",
      });
  
      return res
        .status(200)
        .json({ message: "OK", name: currentUser.name, email: currentUser.email });
    } catch (error) {
      console.log(error);
      return res.status(200).json({ message: "ERROR", cause: error.message });
    }
  };

  