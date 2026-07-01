import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Mendapatkan Daftar Hutang & Piutang dengan Virtual Fields (BE-Calculated)
 */
export const getDebts = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    // 1. Ambil semua kontrak debt_loans milik user
    const { data: debtLoans, error: debtError } = await supabase
      .from('debt_loans')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (debtError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: debtError.message }
      });
      return;
    }

    if (!debtLoans || debtLoans.length === 0) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const loanIds = debtLoans.map(d => d.id);

    // 2. Ambil semua mutasi aktif terkait kontrak-kontrak tersebut
    const { data: mutations, error: mutError } = await supabase
      .from('debt_loan_mutations')
      .select('*')
      .in('debt_loan_id', loanIds)
      .eq('is_deleted', false);

    if (mutError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: mutError.message }
      });
      return;
    }

    const now = new Date();

    const formattedDebts = debtLoans.map(d => {
      const contractMuts = (mutations || []).filter(m => m.debt_loan_id === d.id);

      // Hitung agregat mutasi
      let totalPaid = 0; // type = decrease
      let totalIncrease = 0; // type = increase
      let totalInterest = 0; // type = interest

      contractMuts.forEach(m => {
        const amt = parseFloat(m.amount);
        if (m.type === 'decrease') totalPaid += amt;
        else if (m.type === 'increase') totalIncrease += amt;
        else if (m.type === 'interest') totalInterest += amt;
      });

      // Kalkulasi virtual fields sesuai aturan di panduan
      const remainingPrincipal = Math.max(0, (totalIncrease + totalInterest) - totalPaid);
      
      // Jika flat interest, hitung estimasi total bunga
      const principalAmount = parseFloat(d.principal_amount);
      const interestRate = d.interest_config?.rate || 0;
      const totalEstimatedInterest = d.interest_config?.type === 'flat' 
        ? principalAmount * (interestRate / 100) 
        : 0;

      const totalAmount = principalAmount + totalEstimatedInterest;
      const remainingTotal = Math.max(0, totalAmount - totalPaid);
      const paymentProgress = totalAmount > 0 
        ? Math.min(100, Math.max(0, (totalPaid / totalAmount) * 100)) 
        : 0;

      let daysUntilDue = null;
      if (d.due_date) {
        const dueDateObj = new Date(d.due_date);
        const timeDiff = dueDateObj.getTime() - now.getTime();
        daysUntilDue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      }

      const isNearDue = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7 && d.status !== 'completed';
      const isOverdue = d.status !== 'completed' && d.due_date && new Date(d.due_date) < now;

      return {
        id: d.id,
        type: d.type,
        partyName: d.name,
        partyContact: d.contact,
        principalAmount,
        interestConfig: d.interest_config,
        interestRate,
        status: d.status,
        startDate: d.start_date,
        dueDate: d.due_date,
        completedAt: d.completed_at,
        sourceCategoryId: d.source_category_id,
        note: d.note,
        // Virtual fields
        remainingPrincipal: parseFloat(remainingPrincipal.toFixed(2)),
        remainingTotal: parseFloat(remainingTotal.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2)),
        paymentProgress: parseFloat(paymentProgress.toFixed(2)),
        daysUntilDue,
        isNearDue,
        isOverdue: !!isOverdue
      };
    });

    res.status(200).json({
      success: true,
      data: formattedDebts
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Membuat Kontrak Hutang / Piutang Baru (dan mutasi increase awal)
 */
export const createDebt = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
      type, // 'debt' atau 'loan'
      partyName,
      partyContact,
      principalAmount,
      interestConfig = { type: 'none', rate: 0 },
      startDate = new Date().toISOString(),
      dueDate,
      sourceCategoryId,
      note
    } = req.body;

    if (!type || !partyName || !principalAmount) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Tipe, nama pihak, dan nominal pokok wajib diisi' }
      });
      return;
    }

    // 1. Simpan master kontrak
    const { data: newDebt, error: debtError } = await supabase
      .from('debt_loans')
      .insert({
        user_id: userId,
        type,
        name: partyName,
        contact: partyContact,
        principal_amount: principalAmount,
        interest_config: interestConfig,
        start_date: startDate,
        due_date: dueDate,
        source_category_id: sourceCategoryId,
        status: 'active',
        note
      })
      .select()
      .single();

    if (debtError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: debtError.message }
      });
      return;
    }

    // 2. Buat mutasi increase awal
    const { error: mutError } = await supabase
      .from('debt_loan_mutations')
      .insert({
        debt_loan_id: newDebt.id,
        amount: principalAmount,
        type: 'increase',
        date: startDate,
        note: 'Akad Awal Kontrak'
      });

    if (mutError) {
      console.error('Gagal membuat mutasi increase awal:', mutError.message);
    }

    res.status(201).json({
      success: true,
      data: {
        id: newDebt.id,
        type: newDebt.type,
        partyName: newDebt.name,
        principalAmount: parseFloat(newDebt.principal_amount),
        status: newDebt.status
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Melakukan Pembayaran Hutang / Piutang dengan alokasi FIFO
 */
export const recordPayment = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { debtId } = req.params;
    const {
      amount,
      walletId,
      paymentDate = new Date().toISOString(),
      note = 'Pembayaran Hutang/Piutang'
    } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    if (!amount || !walletId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Nominal pembayaran dan dompet wajib diisi' }
      });
      return;
    }

    // 1. Dapatkan info master kontrak debt_loan
    const { data: debtLoan, error: debtError } = await supabase
      .from('debt_loans')
      .select('*')
      .eq('id', debtId)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (debtError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: debtError.message }
      });
      return;
    }

    if (!debtLoan) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Kontrak hutang/piutang tidak ditemukan' }
      });
      return;
    }

    // Cari kategori transaksi
    let categoryId = debtLoan.source_category_id;
    if (!categoryId) {
      // Cari kategori default sesuai tipe transaksi (debt = expense, loan = income)
      const targetType = debtLoan.type === 'debt' ? 'expense' : 'income';
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .eq('type', targetType)
        .eq('is_deleted', false)
        .limit(1)
        .maybeSingle();
      
      if (cat) {
        categoryId = cat.id;
      } else {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: `Harap buat kategori bertipe ${targetType} terlebih dahulu sebelum membayar.` }
        });
        return;
      }
    }

    // 2. Catat cash flow di tabel transactions (memicu update saldo dompet via trigger DB)
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount,
        type: debtLoan.type === 'debt' ? 'expense' : 'income',
        category_id: categoryId,
        wallet_id: walletId,
        date: paymentDate,
        note,
        debt_id: debtId
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

    // 3. Ambil semua mutasi terdaftar untuk menghitung alokasi FIFO
    const { data: mutations, error: mutError } = await supabase
      .from('debt_loan_mutations')
      .select('*')
      .eq('debt_loan_id', debtId)
      .eq('is_deleted', false)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (mutError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: mutError.message }
      });
      return;
    }

    // Pisahkan mutasi penambah (increase/interest) dan pengurang (decrease)
    const increases = mutations.filter(m => m.type === 'increase' || m.type === 'interest');
    const decreases = mutations.filter(m => m.type === 'decrease');

    // Hitung total bayar sebelumnya
    let prevTotalDecreases = decreases.reduce((sum, d) => sum + parseFloat(d.amount), 0);

    // Hitung sisa alokasi pada masing-masing increase menggunakan FIFO
    const activeIncreases = increases.map(inc => {
      const incAmt = parseFloat(inc.amount);
      let consumed = 0;

      if (prevTotalDecreases > 0) {
        if (prevTotalDecreases >= incAmt) {
          consumed = incAmt;
          prevTotalDecreases -= incAmt;
        } else {
          consumed = prevTotalDecreases;
          prevTotalDecreases = 0;
        }
      }

      return {
        id: inc.id,
        amount: incAmt,
        remaining: incAmt - consumed
      };
    }).filter(inc => inc.remaining > 0);

    // 4. Lakukan alokasi dana pembayaran (FIFO)
    let paymentRemaining = parseFloat(amount);
    const newMutationsPayload: any[] = [];

    for (const inc of activeIncreases) {
      if (paymentRemaining <= 0) break;

      const allocAmount = Math.min(paymentRemaining, inc.remaining);
      newMutationsPayload.push({
        debt_loan_id: debtId,
        transaction_id: tx.id,
        amount: allocAmount,
        type: 'decrease',
        date: paymentDate,
        note: `${note} (FIFO alokasi ke-ID ${inc.id.substring(0, 8)})`
      });

      paymentRemaining -= allocAmount;
    }

    // Jika masih ada sisa pembayaran (misal pelunasan lebih besar dari sisa total pokok/bunga)
    if (paymentRemaining > 0) {
      // Masukkan ke alokasi terakhir
      newMutationsPayload.push({
        debt_loan_id: debtId,
        transaction_id: tx.id,
        amount: paymentRemaining,
        type: 'decrease',
        date: paymentDate,
        note: `${note} (FIFO kelebihan bayar)`
      });
    }

    // Insert ke debt_loan_mutations
    const { data: createdMutations, error: insertMutsError } = await supabase
      .from('debt_loan_mutations')
      .insert(newMutationsPayload)
      .select();

    if (insertMutsError) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: insertMutsError.message }
      });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'Pembayaran utang berhasil dicatat secara FIFO.',
      data: {
        transactionId: tx.id,
        mutations: (createdMutations || []).map(m => ({
          id: m.id,
          amount: parseFloat(m.amount),
          type: m.type,
          note: m.note
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};
