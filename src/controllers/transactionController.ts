import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Mendapatkan Daftar Transaksi (Paginated & Filtered)
 */
export const getTransactions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    const {
      page = '1',
      pageSize = '20',
      type,
      categoryId,
      walletId,
      yearMonth
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(pageSize as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Mulai query ke tabel transactions
    let query = supabase
      .from('transactions')
      .select(`
        id,
        amount,
        type,
        category_id,
        subcategory_id,
        wallet_id,
        date,
        note,
        tags,
        goal_id,
        debt_id,
        recurring_id,
        categories ( name ),
        subcategories ( name ),
        wallets ( name )
      `, { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_deleted', false);

    // Filter berdasarkan Type
    if (type) {
      query = query.eq('type', type);
    }

    // Filter berdasarkan Category
    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    // Filter berdasarkan Wallet
    if (walletId) {
      query = query.eq('wallet_id', walletId);
    }

    // Filter berdasarkan yearMonth (YYYY-MM)
    if (yearMonth && typeof yearMonth === 'string' && /^\d{4}-\d{2}$/.test(yearMonth)) {
      const [yearStr, monthStr] = yearMonth.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10) - 1; // Month is 0-indexed

      // Gunakan timezone UTC untuk rentang bulan agar presisi
      const startDate = new Date(Date.UTC(year, month, 1));
      const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

      query = query.gte('date', startDate.toISOString()).lte('date', endDate.toISOString());
    }

    // Eksekusi query dengan paginasi dan urutan terbaru
    const { data: transactions, error, count } = await query
      .order('date', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error.message }
      });
      return;
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    // Format data untuk dicocokkan dengan CamelCase frontend contract
    const formattedTransactions = (transactions || []).map((t: any) => ({
      id: t.id,
      amount: parseFloat(t.amount),
      type: t.type,
      categoryId: t.category_id,
      categoryName: t.categories?.name || null,
      subcategoryId: t.subcategory_id || null,
      subcategoryName: t.subcategories?.name || null,
      walletId: t.wallet_id || null,
      walletName: t.wallets?.name || null,
      date: t.date,
      note: t.note,
      tags: t.tags || [],
      goalId: t.goal_id || null,
      debtId: t.debt_id || null,
      recurringId: t.recurring_id || null
    }));

    res.status(200).json({
      success: true,
      data: {
        transactions: formattedTransactions,
        pagination: {
          page: pageNum,
          pageSize: limitNum,
          totalCount,
          totalPages,
          hasNextPage: pageNum < totalPages
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Membuat Transaksi Baru (Memicu Trigger DB & Alokasi Anggaran Manual)
 */
export const createTransaction = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    const {
      amount,
      type,
      categoryId,
      walletId,
      date = new Date().toISOString(),
      note,
      tags = [],
      subcategoryId = null,
      goalId = null,
      debtId = null,
      recurringId = null,
      budgetAllocations = {}
    } = req.body;

    if (!amount || !type || !categoryId || !walletId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Nominal, tipe, kategori, dan dompet wajib diisi' }
      });
      return;
    }

    // 1. Tambah transaksi baru ke database
    const { data: newTx, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount,
        type,
        category_id: categoryId,
        subcategory_id: subcategoryId,
        wallet_id: walletId,
        date,
        note,
        tags,
        goal_id: goalId,
        debt_id: debtId,
        recurring_id: recurringId
      })
      .select()
      .single();

    if (txError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: txError.message }
      });
      return;
    }

    // 2. Logika manual Envelope Budgeting (japa-alokasi manual) jika budgetAllocations dikirimkan
    const allocationEntries = Object.entries(budgetAllocations);
    if (allocationEntries.length > 0) {
      const dbAllocations = allocationEntries.map(([catId, allocAmount]) => ({
        transaction_id: newTx.id,
        category_id: catId,
        amount: allocAmount
      }));

      const { error: allocError } = await supabase
        .from('transaction_budget_allocations')
        .insert(dbAllocations);

      if (allocError) {
        console.error('Gagal membuat alokasi budget:', allocError.message);
        // Kita tidak rollback transaksi karena trigger saldo dsb sudah jalan. Cukup log warning.
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: newTx.id,
        amount: parseFloat(newTx.amount),
        type: newTx.type,
        categoryId: newTx.category_id,
        walletId: newTx.wallet_id,
        date: newTx.date,
        note: newTx.note,
        tags: newTx.tags || []
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Soft Delete Transaksi (Membatalkan Efek Saldo Dompet via DB Trigger)
 */
export const deleteTransaction = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const { data: deletedTx, error } = await supabase
      .from('transactions')
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

    if (!deletedTx) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Transaksi tidak ditemukan' }
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Transaksi berhasil dihapus'
    });
  } catch (error) {
    next(error);
  }
};
