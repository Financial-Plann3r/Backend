import { Router } from 'express';
import { getWallets, createWallet, updateWallet, deleteWallet } from '../controllers/walletController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Protect all wallet routes
router.use(requireAuth);

router.get('/', getWallets);
router.post('/', createWallet);
router.put('/:id', updateWallet);
router.delete('/:id', deleteWallet);

export default router;
