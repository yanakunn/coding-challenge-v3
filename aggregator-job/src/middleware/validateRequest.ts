import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationType } from '../types';

export const validateRequest = <T extends z.ZodTypeAny>(
  schema: T,
  validationType: ValidationType = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = req[validationType];
      const validatedData = schema.parse(dataToValidate);

      // Attach validated data to request for type safety
      (req as any).validatedData = validatedData;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          error: 'Validation Error',
          details: formattedErrors,
        });
      }

      next(error);
    }
  };
};
