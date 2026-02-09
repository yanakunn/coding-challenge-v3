import { Request } from "express";
import { z } from "zod";

export interface ValidatedRequest<T extends z.ZodTypeAny> extends Request {
  validatedData?: z.infer<T>;
}

export type ValidationType = "query" | "body" | "params";
