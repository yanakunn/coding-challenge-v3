import { ValidatedRequest } from "../types";
import { z } from "zod";

export const deductionsQuerySchema = z.object({
  storeId: z.string().min(1, "storeId is required"),
  deductionId: z.string().min(1, "deductionId is required"),
});

export type DeductionsQuery = z.infer<typeof deductionsQuerySchema>;

/** Request type for routes that use validateRequest(deductionsQuerySchema, ...) */
export type DeductionsValidatedRequest = ValidatedRequest<
  typeof deductionsQuerySchema
>;
