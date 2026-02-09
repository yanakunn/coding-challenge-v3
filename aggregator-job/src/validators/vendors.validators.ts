import { z } from 'zod';
import moment from 'moment-timezone';
import { isValidISODate } from '../utils/dateUtils';

export const vendorsQuerySchema = z
  .object({
    storeId: z.string().min(1, 'storeId is required'),
    updatedAfter: z
      .string()
      .min(1, 'updatedAfter is required')
      .refine(isValidISODate, {
        message: 'updatedAfter must be a valid ISO 8601 date string',
      }),
    updatedBefore: z
      .string()
      .min(1, 'updatedBefore is required')
      .refine(isValidISODate, {
        message: 'updatedBefore must be a valid ISO 8601 date string',
      }),
  })
  .refine(
    (data) => {
      const after = moment(data.updatedAfter);
      const before = moment(data.updatedBefore);
      return before.isAfter(after);
    },
    {
      message: 'updatedBefore must be after updatedAfter',
      path: ['updatedBefore'],
    }
  );

export type VendorsQuery = z.infer<typeof vendorsQuerySchema>;
