import { Router, Request, Response } from 'express';
import { sequelize } from '../config/database';
import { getCurrentTimestamp } from '../utils/dateUtils';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
  const timestamp = getCurrentTimestamp();

  try {
    await sequelize.authenticate();

    res.status(200).json({
      status: 'ok',
      timestamp,
      database: 'connected',
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp,
      database: 'disconnected',
    });
  }
});

export default router;
