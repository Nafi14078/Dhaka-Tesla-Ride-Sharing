import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth.service";

export interface AuthedRequest extends Request {
  user?: { id: string; role: "PASSENGER" | "DRIVER" };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Restricts a route to a specific role (e.g. only DRIVER can accept rides). */
export function requireRole(role: "PASSENGER" | "DRIVER") {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ error: `This action requires role ${role}` });
    }
    next();
  };
}