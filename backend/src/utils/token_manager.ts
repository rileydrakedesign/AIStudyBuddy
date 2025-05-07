import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "./constants.js";

/* ── NEW ─────────────────────────────────────────── */
import logger from "./logger.js";  // root pino instance
/* ─────────────────────────────────────────────────── */

export const createToken = (id: string, email: string, expiresIn: string) => {
  const payload = { id, email };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
  return token;
};

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.signedCookies[COOKIE_NAME];
  if (!token || token.trim() === "") {
    return res.status(401).json({ message: "Token Not Received" });
  }

  return new Promise<void>((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded: any) => {
      if (err) {
        reject(err.message);
        return res.status(401).json({ message: "Token Expired" });
      }

      /* keep existing behaviour */
      res.locals.jwtData = decoded;

      /* ── NEW: attach userId to this request’s logger ── */
      const base = (req as any).log ?? logger;      // pino-http adds req.log
      (req as any).log = base.child({ userId: decoded.id });

      resolve();
      return next();
    });
  });
};
