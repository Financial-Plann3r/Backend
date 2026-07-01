import { Router } from 'express';
import { getProfile, updateProfile } from '../controllers/userController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Protect user routes
router.use(requireAuth);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);

export default router;
