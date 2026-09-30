import {
  DeductionsValidatedRequest,
  deductionsQuerySchema,
} from "../validators/vendors.validators";
import { Response, Router } from "express";

import { processDeduction } from "../services/deductions.service";
import { logger } from "../utils/logger";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

router.post(
  "/deductions",
  validateRequest(deductionsQuerySchema, "body"),
  async (req: DeductionsValidatedRequest, res: Response) => {
    // Set by validateRequest middleware; safe to assert
    const { storeId, deductionId } = req.validatedData!;
    logger.info(
      `Processing deductions for store ${storeId} deductionId ${deductionId}`,
    );
    const startedAt = Date.now();

    const { removed, created } = await processDeduction(storeId, deductionId);

    logger.info("Deduction request finished", {
      storeId,
      deductionId,
      removed,
      created,
      durationMs: Date.now() - startedAt,
    });
    res.status(200).json({
      status: "success",
      message: "Deductions processed successfully",
      expenseEventsCreated: created,
      expenseEventsRemoved: removed,
    });
  },
);

export default router;
