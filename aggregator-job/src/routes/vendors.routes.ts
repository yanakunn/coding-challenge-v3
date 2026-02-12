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
    const { storeId, deductionId } = req.validatedData!;
    logger.info(
      `Processing deductions for store ${storeId} deductionId ${deductionId}`,
    );

    // TODO: Implement the logic to process the deduction

    res.status(200).json({
      status: "ok",
    });
  },
);

export default router;
