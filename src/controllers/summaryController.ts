import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Helper untuk melakukan kalkulasi data summary bulanan
 */
const calculateMonthlySummary = async (userId: string, yearMonth: string): Promise<any> => {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;

  const startDate = new Date(Date.UTC(year, month, 1));
  const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  // 1. Fetch seluruh transaksi aktif di bulan ini
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select(`
      id, amount, type, category_id, subcategory_id, wallet_id, date, note, tags, goal_id, debt_id,
      categories ( name, type, icon ),
      wallets ( name, type )
    `)
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .gte('date', startDate.toISOString())
    .lte('date', endDate.toISOString());

  if (txError) throw txError;

  // 2. Fetch data anggaran bulanan
  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('allocated_amount, spent_amount')
    .eq('user_id', userId)
    .eq('year_month', yearMonth);

  if (budgetError) throw budgetError;

  // 3. Fetch data mutasi hutang/piutang bulan ini
  const { data: mutations, error: mutError } = await supabase
    .from('debt_loan_mutations')
    .select(`
      id, amount, type, date,
      debt_loans ( type )
    `)
    .eq('is_deleted', false)
    .gte('date', startDate.toISOString())
    .lte('date', endDate.toISOString());

  if (mutError) throw mutError;

  // -- PROSES AGREGASI --
  let totalIncome = 0;
  let totalExpense = 0;
  let totalInvestmentExpense = 0;
  let countIncome = 0;
  let countExpense = 0;

  const incomeByCat: Record<string, number> = {};
  const expenseByCat: Record<string, number> = {};
  const expenseByWallet: Record<string, number> = {};

  const categoryIncomeSums: Record<string, number> = {};
  const categoryExpenseSums: Record<string, number> = {};
  const categorySpendingSums: Record<string, number> = {}; // exclude investment

  (transactions || []).forEach((t: any) => {
    const amt = parseFloat(t.amount);
    const catName = t.categories?.name || 'Kategori Lain';
    const catId = t.category_id;
    const walletName = t.wallets?.name || 'Dompet Lain';
    const isInvestment = t.wallets?.type === 'investment';

    if (t.type === 'income') {
      totalIncome += amt;
      countIncome++;
      incomeByCat[catName] = (incomeByCat[catName] || 0) + amt;
      categoryIncomeSums[catId] = (categoryIncomeSums[catId] || 0) + amt;
    } else if (t.type === 'expense') {
      totalExpense += amt;
      countExpense++;
      expenseByCat[catName] = (expenseByCat[catName] || 0) + amt;
      categoryExpenseSums[catId] = (categoryExpenseSums[catId] || 0) + amt;
      expenseByWallet[walletName] = (expenseByWallet[walletName] || 0) + amt;

      if (isInvestment) {
        totalInvestmentExpense += amt;
      } else {
        categorySpendingSums[catId] = (categorySpendingSums[catId] || 0) + amt;
      }
    }
  });

  const totalCount = countIncome + countExpense;

  // Tentukan pembagi hari (apakah bulan berjalan atau bulan lalu)
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const denomDays = isCurrentMonth ? Math.max(1, now.getDate()) : daysInMonth;

  // Rata-rata
  const avgDailyExpense = totalExpense / denomDays;
  const avgDailySpendingExpense = (totalExpense - totalInvestmentExpense) / denomDays;
  const avgTransactionAmount = totalCount > 0 ? (totalIncome + totalExpense) / totalCount : 0;

  // Cari top categories
  const getTopKey = (obj: Record<string, number>): string | null => {
    let topKey: string | null = null;
    let maxVal = -1;
    Object.entries(obj).forEach(([key, val]) => {
      if (val > maxVal) {
        maxVal = val;
        topKey = key;
      }
    });
    return topKey;
  };

  const topIncomeCategoryId = getTopKey(categoryIncomeSums);
  const topExpenseCategoryId = getTopKey(categoryExpenseSums);
  const topSpendingCategoryId = getTopKey(categorySpendingSums);

  // Perhitungan budget utilization
  let totalAllocated = 0;
  let totalSpent = 0;
  (budgets || []).forEach(b => {
    totalAllocated += parseFloat(b.allocated_amount || '0');
    totalSpent += parseFloat(b.spent_amount || '0');
  });
  const budgetUtilization = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

  // Persentase tabungan
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

  // Kalkulasi mutasi hutang/piutang
  let totalDebtPayments = 0;
  let totalLoanPayments = 0;
  let debtPaymentCount = 0;
  let loanPaymentCount = 0;

  (mutations || []).forEach((m: any) => {
    if (m.type === 'decrease' && m.debt_loans) {
      const amt = parseFloat(m.amount);
      if (m.debt_loans.type === 'debt') {
        totalDebtPayments += amt;
        debtPaymentCount++;
      } else if (m.debt_loans.type === 'loan') {
        totalLoanPayments += amt;
        loanPaymentCount++;
      }
    }
  });

  const summaryData = {
    user_id: userId,
    year_month: yearMonth,
    total_income: totalIncome,
    total_expense: totalExpense,
    savings_rate: parseFloat(savingsRate.toFixed(2)),
    budget_utilization: parseFloat(budgetUtilization.toFixed(2)),
    income_by_category: incomeByCat,
    expense_by_category: expenseByCat,
    expense_by_wallet: expenseByWallet,
    transaction_count: {
      income: countIncome,
      expense: countExpense,
      total: totalCount
    },
    avg_daily_expense: parseFloat(avgDailyExpense.toFixed(2)),
    avg_daily_spending_expense: parseFloat(avgDailySpendingExpense.toFixed(2)),
    total_investment_expense: totalInvestmentExpense,
    avg_transaction_amount: parseFloat(avgTransactionAmount.toFixed(2)),
    top_income_category_id: topIncomeCategoryId,
    top_expense_category_id: topExpenseCategoryId,
    top_spending_category_id: topSpendingCategoryId,
    debt_transactions: {
      totalDebtPayments,
      totalLoanPayments,
      debtPaymentCount,
      loanPaymentCount
    },
    is_calculated: true,
    updated_at: new Date().toISOString()
  };

  // Lakukan UPSERT ke tabel summaries
  const { data: upserted, error: upsertError } = await supabase
    .from('summaries')
    .upsert(summaryData, { onConflict: 'user_id, year_month' })
    .select()
    .single();

  if (upsertError) throw upsertError;
  return upserted;
};

/**
 * Mendapatkan Ringkasan Bulanan (Data Cache Teragregasi)
 */
export const getSummary = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const yearMonth = req.params.yearMonth as string;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Format parameter yearMonth wajib YYYY-MM' }
      });
      return;
    }

    // 1. Cek apakah summaries cache sudah ada dan terhitung
    const { data: existingSummary, error } = await supabase
      .from('summaries')
      .select('*')
      .eq('user_id', userId)
      .eq('year_month', yearMonth)
      .maybeSingle();

    if (error) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error.message }
      });
      return;
    }

    let summary = existingSummary;

    // 2. Jika tidak ada cache atau belum dikalkulasi, kalkulasi ulang sekarang
    if (!summary || !summary.is_calculated) {
      try {
        summary = await calculateMonthlySummary(userId, yearMonth);
      } catch (calcErr: any) {
        res.status(500).json({
          success: false,
          error: { code: 'CALCULATION_ERROR', message: calcErr.message }
        });
        return;
      }
    }

    // 3. Ambil detail kategori name dari id (untuk detail top categories) jika terisi
    let topExpenseCategory = null;
    if (summary.top_expense_category_id) {
      const { data: cat } = await supabase
        .from('categories')
        .select('name')
        .eq('id', summary.top_expense_category_id)
        .maybeSingle();
      if (cat) {
        const topAmt = summary.expense_by_category[cat.name] || 0;
        topExpenseCategory = {
          categoryId: summary.top_expense_category_id,
          categoryName: cat.name,
          amount: topAmt,
          percentage: summary.total_expense > 0 ? parseFloat(((topAmt / summary.total_expense) * 100).toFixed(2)) : 0
        };
      }
    }

    // Kembalikan ke format camelCase sesuai kontrak frontend
    res.status(200).json({
      success: true,
      data: {
        yearMonth: summary.year_month,
        totalIncome: parseFloat(summary.total_income),
        totalExpense: parseFloat(summary.total_expense),
        balance: parseFloat(summary.balance),
        savingsRate: parseFloat(summary.savings_rate),
        budgetUtilization: parseFloat(summary.budget_utilization),
        avgDailyExpense: parseFloat(summary.avg_daily_expense),
        avgDailySpendingExpense: parseFloat(summary.avg_daily_spending_expense),
        totalInvestmentExpense: parseFloat(summary.total_investment_expense),
        avgTransactionAmount: parseFloat(summary.avg_transaction_amount),
        transactionCount: summary.transaction_count,
        incomeByCategory: summary.income_by_category,
        expenseByCategory: summary.expense_by_category,
        expenseByWallet: summary.expense_by_wallet,
        topExpenseCategory,
        debtTransactions: summary.debt_transactions
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Memicu Kalkulasi Ulang Laporan secara Paksa
 */
export const recalculateSummary = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    const yearMonth = req.params.yearMonth as string;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Format parameter yearMonth wajib YYYY-MM' }
      });
      return;
    }

    await calculateMonthlySummary(userId, yearMonth);

    res.status(200).json({
      success: true,
      message: 'Kalkulasi ulang berhasil dilakukan'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'RECALCULATE_FAILED', message: error.message }
    });
  }
};
