import { Router } from 'express';
import { getCategories, createSubcategory, createCategory } from '../controllers/categoryController';
import { requireAuth } from '../middlewares/authMiddleware';

const router = Router();

// Protect all category routes
router.use(requireAuth);

router.get('/', getCategories);
router.post('/', createCategory); // Opsional endpoint untuk membuat kategori baru
router.post('/:categoryId/subcategories', createSubcategory);

export default router;
