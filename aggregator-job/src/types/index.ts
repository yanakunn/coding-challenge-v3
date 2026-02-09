import { Request } from "express";
import { z } from "zod";

/** Request with validatedData set by validateRequest middleware. Use with the schema type for inference. */
export interface ValidatedRequest<T extends z.ZodTypeAny> extends Request {
  validatedData?: z.infer<T>;
}

export type ValidationType = "query" | "body" | "params";
