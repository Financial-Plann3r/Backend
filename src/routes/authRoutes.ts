import { Router } from 'express';
import { signUp, signIn, getProfile } from '../controllers/authController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Public auth routes
router.post('/signup', signUp);
router.post('/signin', signIn);

// Private/Protected auth route (requires JWT validation)
router.get('/profile', requireAuth, getProfile);

export default router;
