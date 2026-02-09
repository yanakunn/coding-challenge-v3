import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
  });

  const statusCode = (err as any).statusCode || 500;
  const isProduction = env.NODE_ENV === 'production';

  res.status(statusCode).json({
    error: err.message || 'Internal Server Error',
    ...(isProduction ? {} : { stack: err.stack }),
  });
};
