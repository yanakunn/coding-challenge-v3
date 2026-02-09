import { Router } from 'express';
import healthRoutes from './health.routes';
import vendorsRoutes from './vendors.routes';

const router = Router();

// Mount routes
router.use(healthRoutes);
router.use(vendorsRoutes);

export default router;
