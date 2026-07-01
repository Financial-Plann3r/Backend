import { Router } from 'express';
import { getGoals, createGoal } from '../controllers/goalController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Protect all goal routes
router.use(requireAuth);

router.get('/', getGoals);
router.post('/', createGoal);

export default router;
