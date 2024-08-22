import user from "../models/user.js";
import { hash, compare } from "bcrypt";
import { createToken } from "../utils/token_manager.js";
import { COOKIE_NAME } from "../utils/constants.js";
export const getAllUsers = async (req, res, next) => {
    try {
        //get all users
        const users = await user.find();
        return res.status(200).json({ message: "OK", users });
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
export const userSignup = async (req, res, next) => {
    try {
        //user signup
        const { name, email, password } = req.body;
        const existingUser = await user.findOne({ email });
        if (existingUser)
            return res.status(401).send("User already registered");
        const hashedPassword = await hash(password, 10);
        const newUser = new user({ name, email, password: hashedPassword });
        await newUser.save();
        //create token and store cookie
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            domain: "localhost",
            signed: true,
            path: "/",
        });
        const token = createToken(newUser._id.toString(), newUser.email, "7d");
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);
        res.cookie(COOKIE_NAME, token, {
            path: "/",
            domain: "localhost", //change to domain for production
            expires,
            httpOnly: true,
            signed: true,
        });
        return res.status(200).json({ message: "OK", name: newUser.name, email: newUser.email });
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
export const userLogin = async (req, res, next) => {
    try {
        //user signup
        const { email, password } = req.body;
        const currentUser = await user.findOne({ email });
        if (!currentUser) {
            return res.status(401).send("User not registered");
        }
        const isPasswordCorrect = await compare(password, currentUser.password);
        if (!isPasswordCorrect) {
            return res.status(403).send("Incorrect password");
        }
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            domain: "localhost",
            signed: true,
            path: "/",
        });
        const token = createToken(currentUser._id.toString(), currentUser.email, "7d");
        const expires = new Date();
        expires.setDate(expires.getDate() + 7);
        res.cookie(COOKIE_NAME, token, {
            path: "/",
            domain: "localhost", //change to domain for production
            expires,
            httpOnly: true,
            signed: true,
        });
        return res.status(200).json({ message: "OK", name: currentUser.name, email: currentUser.email });
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
export const verifyUser = async (req, res, next) => {
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
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
export const userLogout = async (req, res, next) => {
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
            domain: "localhost",
            signed: true,
            path: "/",
        });
        return res
            .status(200)
            .json({ message: "OK", name: currentUser.name, email: currentUser.email });
    }
    catch (error) {
        console.log(error);
        return res.status(200).json({ message: "ERROR", cause: error.message });
    }
};
//# sourceMappingURL=user_controllers.js.map