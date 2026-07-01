import { Router } from 'express';
import { getSummary, recalculateSummary } from '../controllers/summaryController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Protect all summary routes
router.use(requireAuth);

router.get('/:yearMonth', getSummary);
router.post('/:yearMonth/recalculate', recalculateSummary);

export default router;
