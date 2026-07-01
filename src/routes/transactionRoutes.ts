import { Router } from 'express';
import { getTransactions, createTransaction, deleteTransaction } from '../controllers/transactionController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Protect all transaction routes
router.use(requireAuth);

router.get('/', getTransactions);
router.post('/', createTransaction);
router.delete('/:id', deleteTransaction);

export default router;
