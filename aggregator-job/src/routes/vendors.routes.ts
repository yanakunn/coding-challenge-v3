import {
  DeductionsValidatedRequest,
  deductionsQuerySchema,
} from "../validators/vendors.validators";
import { Response, Router } from "express";

import { logger } from "../utils/logger";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

router.post(
  "/deductions",
  validateRequest(deductionsQuerySchema, "body"),
  (req: DeductionsValidatedRequest, res: Response) => {
    // Set by validateRequest middleware; safe to assert
    const { storeId, updatedAfter, updatedBefore } = req.validatedData!;
    logger.info(
      `Processing deductions for store ${storeId} from ${updatedAfter} to ${updatedBefore}`,
    );

    // TODO: Implement the logic to process the deductions which have been updated

    res.status(200).json({
      status: "ok",
    });
  },
);

export default router;
