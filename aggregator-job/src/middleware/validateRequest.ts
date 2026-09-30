import { NextFunction, Request, Response } from "express";
import { ValidatedRequest, ValidationType } from "../types";

import { z } from "zod";

export const validateRequest = <T extends z.ZodTypeAny>(
  schema: T,
  validationType: ValidationType = "body",
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = req[validationType];
      const validatedData = schema.parse(dataToValidate) as z.infer<T>;

      // Attach validated data to request for type safety
      (req as ValidatedRequest<T>).validatedData = validatedData;

      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          path: err.path.join("."),
          message: err.message,
        }));

        return res.status(400).json({
          error: "Validation Error",
          // Spec shape added alongside the original fields.
          status: "error",
          code: "INVALID_REQUEST",
          message: "Validation Error",
          details: formattedErrors,
        });
      }

      next(error);
    }
  };
};
