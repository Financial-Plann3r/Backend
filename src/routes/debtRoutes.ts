import { Router } from 'express';
import { getDebts, createDebt, recordPayment } from '../controllers/debtController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Protect all debt routes
router.use(requireAuth);

router.get('/', getDebts);
router.post('/', createDebt);
router.post('/:debtId/payments', recordPayment);

export default router;
