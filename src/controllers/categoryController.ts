import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Mendapatkan Daftar Kategori beserta Subkategori
 */
export const getCategories = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    // 1. Ambil kategori aktif milik user
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (catError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: catError.message }
      });
      return;
    }

    // 2. Ambil subkategori aktif milik user
    const { data: subcategories, error: subError } = await supabase
      .from('subcategories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (subError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: subError.message }
      });
      return;
    }

    // 3. Asosiasikan subkategori ke masing-masing kategori
    const formattedCategories = categories.map(cat => {
      const catSubs = subcategories
        .filter(sub => sub.category_id === cat.id)
        .map(sub => ({
          id: sub.id,
          name: sub.name,
          isActive: sub.is_active
        }));

      return {
        id: cat.id,
        name: cat.name,
        type: cat.type,
        icon: cat.icon,
        color: cat.color,
        applyToBudget: cat.apply_to_budget,
        subcategories: catSubs
      };
    });

    res.status(200).json({
      success: true,
      data: formattedCategories
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Membuat Subkategori Baru
 */
export const createSubcategory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { categoryId } = req.params;
    const { name } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    if (!name) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Nama subkategori wajib diisi' }
      });
      return;
    }

    // 1. Pastikan kategori tersebut ada dan milik user
    const { data: category, error: catError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', categoryId)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (catError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: catError.message }
      });
      return;
    }

    if (!category) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Kategori utama tidak ditemukan' }
      });
      return;
    }

    // 2. Insert subkategori baru
    const { data: newSub, error: insertError } = await supabase
      .from('subcategories')
      .insert({
        category_id: categoryId,
        user_id: userId,
        name,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: insertError.message }
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        id: newSub.id,
        name: newSub.name,
        isActive: newSub.is_active
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Membuat Kategori Baru (Opsional, untuk fleksibilitas)
 */
export const createCategory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { name, type, icon, color, applyToBudget = true } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    if (!name || !type || !icon || !color) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Nama, tipe, ikon, dan warna wajib diisi' }
      });
      return;
    }

    const { data: newCat, error } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        name,
        type,
        icon,
        color,
        apply_to_budget: applyToBudget,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error.message }
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        id: newCat.id,
        name: newCat.name,
        type: newCat.type,
        icon: newCat.icon,
        color: newCat.color,
        applyToBudget: newCat.apply_to_budget,
        subcategories: []
      }
    });
  } catch (error) {
    next(error);
  }
};
