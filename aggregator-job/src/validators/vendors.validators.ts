import { ValidatedRequest } from "../types";
import { isValidISODate } from "../utils/dateUtils";
import moment from "moment-timezone";
import { z } from "zod";

export const deductionsQuerySchema = z
  .object({
    storeId: z.string().min(1, "storeId is required"),
    updatedAfter: z
      .string()
      .min(1, "updatedAfter is required")
      .refine(isValidISODate, {
        message: "updatedAfter must be a valid ISO 8601 date string",
      }),
    updatedBefore: z
      .string()
      .min(1, "updatedBefore is required")
      .refine(isValidISODate, {
        message: "updatedBefore must be a valid ISO 8601 date string",
      }),
  })
  .refine(
    (data) => {
      const after = moment(data.updatedAfter);
      const before = moment(data.updatedBefore);
      return before.isAfter(after);
    },
    {
      message: "updatedBefore must be after updatedAfter",
      path: ["updatedBefore"],
    },
  );

export type DeductionsQuery = z.infer<typeof deductionsQuerySchema>;

/** Request type for routes that use validateRequest(deductionsQuerySchema, ...) */
export type DeductionsValidatedRequest = ValidatedRequest<
  typeof deductionsQuerySchema
>;
