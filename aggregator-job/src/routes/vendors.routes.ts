import { Router, Request, Response } from 'express';
import { validateRequest } from '../middleware/validateRequest';
import { vendorsQuerySchema } from '../validators/vendors.validators';

const router = Router();

router.get(
  '/vendors',
  validateRequest(vendorsQuerySchema, 'query'),
  (req: Request, res: Response) => {
    // Query parameters are validated by middleware
    // validatedData is available on req for type safety
    res.status(200).json({
      status: 'ok',
    });
  }
);

export default router;
