import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "./constants.js";
/* ── NEW ─────────────────────────────────────────── */
import logger from "./logger.js"; // root pino instance
/* ─────────────────────────────────────────────────── */
export const createToken = (id, email, expiresIn) => {
    const payload = { id, email };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
    return token;
};
export const verifyToken = async (req, res, next) => {
    const token = req.signedCookies[COOKIE_NAME];
    if (!token || token.trim() === "") {
        return res.status(401).json({ message: "Token Not Received" });
    }
    return new Promise((resolve, reject) => {
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) {
                reject(err.message);
                return res.status(401).json({ message: "Token Expired" });
            }
            /* keep existing behaviour */
            res.locals.jwtData = decoded;
            /* ── NEW: attach userId to this request’s logger ── */
            const base = req.log ?? logger; // pino-http adds req.log
            req.log = base.child({ userId: decoded.id });
            resolve();
            return next();
        });
    });
};
//# sourceMappingURL=token_manager.js.map