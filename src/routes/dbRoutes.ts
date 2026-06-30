import { Router } from 'express';
import { getTableRecords, insertTableRecord } from '../controllers/dbController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Secure all database proxy operations using auth middleware
router.use(requireAuth);

router.get('/:tableName', getTableRecords);
router.post('/:tableName', insertTableRecord);

export default router;
