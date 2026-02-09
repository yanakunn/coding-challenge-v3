import { Request, Response, Router } from "express";

import { deductionsQuerySchema } from "../validators/vendors.validators";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

router.post(
  "/deductions",
  validateRequest(deductionsQuerySchema, "body"),
  (req: Request, res: Response) => {
    // Body parameters are validated by middleware
    // validatedData is available on req for type safety
    res.status(200).json({
      status: "ok",
    });
  },
);

export default router;
