import "express-async-errors";

import express, { NextFunction, Request, Response } from "express";

import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import helmet from "helmet";
import { logger } from "./utils/logger";
import routes from "./routes";

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    query: req.query,
    body: req.body,
  });
  next();
});

// Mount API routes
app.use("/api", routes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;
