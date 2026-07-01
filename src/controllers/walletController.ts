import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Mendapatkan Daftar Dompet Aktif
 */
export const getWallets = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error.message }
      });
      return;
    }

    // Ubah ke format camelCase untuk frontend
    const formattedWallets = wallets.map(wallet => ({
      id: wallet.id,
      name: wallet.name,
      type: wallet.type,
      description: wallet.description,
      balance: parseFloat(wallet.balance),
      isActive: wallet.is_active
    }));

    res.status(200).json({
      success: true,
      data: formattedWallets
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Membuat Dompet Baru (Dibatasi Plan Limits)
 */
export const createWallet = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    const { name, type, description, initialBalance = 0.00 } = req.body;

    if (!name || !type) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Nama dan tipe dompet wajib diisi' }
      });
      return;
    }

    // 1. Ambil plan user
    let { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('plan')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: profileError.message }
      });
      return;
    }

    const plan = userProfile?.plan || 'free';

    // 2. Hitung jumlah dompet aktif
    const { count, error: countError } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_deleted', false);

    if (countError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: countError.message }
      });
      return;
    }

    const activeWalletCount = count || 0;

    // 3. Batasan plan limit (Free plan maksimal 3 dompet aktif)
    if (plan === 'free' && activeWalletCount >= 3) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Batas limit paket gratis tercapai. Upgrade paket Anda untuk menambahkan lebih banyak dompet.'
        }
      });
      return;
    }

    // 4. Insert dompet baru
    const { data: newWallet, error: insertError } = await supabase
      .from('wallets')
      .insert({
        user_id: userId,
        name,
        type,
        description,
        balance: initialBalance
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
        id: newWallet.id,
        name: newWallet.name,
        type: newWallet.type,
        description: newWallet.description,
        balance: parseFloat(newWallet.balance),
        isActive: newWallet.is_active
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Memperbarui Dompet
 */
export const updateWallet = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, type, description, isActive } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    const updatePayload: any = {};
    if (name !== undefined) updatePayload.name = name;
    if (type !== undefined) updatePayload.type = type;
    if (description !== undefined) updatePayload.description = description;
    if (isActive !== undefined) updatePayload.is_active = isActive;
    updatePayload.updated_at = new Date().toISOString();

    const { data: updatedWallet, error } = await supabase
      .from('wallets')
      .update(updatePayload)
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .select()
      .maybeSingle();

    if (error) {
      res.status(400).json({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error.message }
      });
      return;
    }

    if (!updatedWallet) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dompet tidak ditemukan atau telah dihapus' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: updatedWallet.id,
        name: updatedWallet.name,
        type: updatedWallet.type,
        description: updatedWallet.description,
        balance: parseFloat(updatedWallet.balance),
        isActive: updatedWallet.is_active
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft Delete Dompet
 */
export const deleteWallet = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    const { data: deletedWallet, error } = await supabase
      .from('wallets')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error.message }
      });
      return;
    }

    if (!deletedWallet) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dompet tidak ditemukan' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Dompet berhasil dihapus'
    });
  } catch (error) {
    next(error);
  }
};
