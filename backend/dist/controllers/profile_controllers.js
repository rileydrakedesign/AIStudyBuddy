import User from "../models/user.js";
// Retrieve the current user's profile using the stored "name" field.
export const getUserProfile = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res.status(401).json({ message: "User not found" });
        }
        return res.status(200).json({
            message: "OK",
            profile: {
                name: currentUser.name || "",
                email: currentUser.email,
                plan: "Free Tier" // Default value as plan is not stored in the schema.
            },
        });
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
// Update the user's profile (name only - email changes use separate secure flow)
export const updateUserProfile = async (req, res, next) => {
    try {
        const { name } = req.body;
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res.status(401).json({ message: "User not found" });
        }
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ message: "Name is required" });
        }
        currentUser.name = name.trim();
        await currentUser.save();
        req.log?.info({ userId: currentUser._id, name: currentUser.name }, "User profile updated");
        return res.status(200).json({
            message: "Profile updated successfully",
            profile: {
                name: currentUser.name,
                email: currentUser.email,
                plan: "Free Tier"
            },
        });
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
// Minimal stub for resetting the user's password.
export const resetUserPassword = async (req, res, next) => {
    try {
        return res.status(200).json({ message: "Password reset functionality not implemented yet" });
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
// Minimal stub for changing the user's plan.
export const changeUserPlan = async (req, res, next) => {
    try {
        return res.status(200).json({ message: "Plan change functionality not implemented yet" });
    }
    catch (error) {
        req.log.error(error);
        return res.status(500).json({ message: "ERROR", cause: error.message });
    }
};
//# sourceMappingURL=profile_controllers.js.map