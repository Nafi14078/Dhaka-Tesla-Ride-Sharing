import { Request, Response, NextFunction } from "express";
import { RideError } from "../services/errors";

// Central error handler — keeps controllers free of try/catch
// boilerplate and gives every error a consistent JSON shape and the
// right HTTP status. Unknown errors are logged and returned as 500
// without leaking internals to the client.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof RideError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

// Wraps an async Express handler so thrown/rejected errors reach
// errorHandler instead of crashing the process.
export function asyncHandler(fn: (...args: any[]) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}