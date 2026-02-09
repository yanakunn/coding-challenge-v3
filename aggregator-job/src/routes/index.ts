import { Router } from "express";
import healthRoutes from "./health.routes";
import vendorsRoutes from "./vendors.routes";

const router = Router();

// Mount routes
router.use("/health", healthRoutes);
router.use("/vendors", vendorsRoutes);

export default router;
