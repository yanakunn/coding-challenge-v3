import { NextFunction, Request, Response } from "express";

import { env } from "../config/env";
import { logger } from "../utils/logger";

// Must declare `next` (arity 4) or Express treats this as regular
// middleware and errors fall through to the default HTML handler.
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  logger.error("Error occurred:", {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
  });

  const statusCode = (err as any).statusCode || 500;
  const isProduction = env.NODE_ENV === "production";
  const apiCode = (err as any).code as string | undefined;

  res.status(statusCode).json({
    // Spec shape ({status, error, message}) added alongside the original
    // fields so existing consumers keep working.
    error: apiCode || err.message || "Internal Server Error",
    ...(apiCode ? { status: "error", message: err.message } : {}),
    ...(isProduction ? {} : { stack: err.stack }),
  });
};
