import { Router, Request, Response } from 'express';
import authRoutes from './authRoutes';
import dbRoutes from './dbRoutes';

const router = Router();

// Subroutes mounting
router.use('/auth', authRoutes);
router.use('/db', dbRoutes);

// Route level health-check endpoint
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    message: 'Financial Plann3r API Gateway is functional. Subroutes /auth and /db are mounted.'
  });
});

export default router;
