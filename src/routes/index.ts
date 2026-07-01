import { Router, Request, Response } from 'express';
import authRoutes from './authRoutes';
import dbRoutes from './dbRoutes';
import userRoutes from './userRoutes';
import walletRoutes from './walletRoutes';
import categoryRoutes from './categoryRoutes';
import transactionRoutes from './transactionRoutes';
import goalRoutes from './goalRoutes';
import debtRoutes from './debtRoutes';
import summaryRoutes from './summaryRoutes';

const router = Router();

// Subroutes mounting
router.use('/auth', authRoutes);
router.use('/db', dbRoutes); // Tetap dipertahankan untuk kebutuhan proxy jika ada
router.use('/users', userRoutes);
router.use('/wallets', walletRoutes);
router.use('/categories', categoryRoutes);
router.use('/transactions', transactionRoutes);
router.use('/goals', goalRoutes);
router.use('/debts', debtRoutes);
router.use('/summaries', summaryRoutes);

// Route level health-check endpoint
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    message: 'Financial Plann3r API Gateway is functional. Subroutes /auth, /users, /wallets, /categories, /transactions, /goals, /debts, and /summaries are mounted.'
  });
});

export default router;
