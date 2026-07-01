import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Mendapatkan Daftar Goals dengan Kalkulasi Progres Dinamis (Virtual Fields)
 */
export const getGoals = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    const { data: goals, error } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error.message }
      });
      return;
    }

    const now = new Date();

    const formattedGoals = (goals || []).map(goal => {
      const targetAmount = parseFloat(goal.target_amount);
      const currentAmount = parseFloat(goal.current_amount || '0');
      
      // 1. remainingAmount
      const remainingAmount = Math.max(0, targetAmount - currentAmount);

      // 2. percentageComplete
      const percentageComplete = targetAmount > 0 
        ? Math.min(100, Math.max(0, (currentAmount / targetAmount) * 100))
        : 0;

      // 3. daysUntilDeadline
      let daysUntilDeadline = null;
      if (goal.deadline) {
        const deadlineDate = new Date(goal.deadline);
        const timeDiff = deadlineDate.getTime() - now.getTime();
        daysUntilDeadline = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
      }

      // 4. monthlyRequired
      let monthlyRequired = 0;
      if (remainingAmount > 0 && goal.deadline) {
        const deadlineDate = new Date(goal.deadline);
        const startDate = new Date(goal.start_date);
        const referenceDate = now > startDate ? now : startDate;

        let monthsRemaining = (deadlineDate.getFullYear() - referenceDate.getFullYear()) * 12 + (deadlineDate.getMonth() - referenceDate.getMonth());
        
        // Cek jika ada sisa hari di bulan berjalan, anggap sisa bulan minimal 1 jika deadline belum terlewati
        if (monthsRemaining <= 0) {
          monthsRemaining = 1;
        }
        monthlyRequired = remainingAmount / monthsRemaining;
      }

      // 5. isOnTrack (Linear trajectory)
      let isOnTrack = true;
      if (goal.deadline && goal.status !== 'completed' && currentAmount < targetAmount) {
        const deadlineDate = new Date(goal.deadline);
        const startDate = new Date(goal.start_date);
        
        const totalDuration = deadlineDate.getTime() - startDate.getTime();
        const elapsedDuration = now.getTime() - startDate.getTime();

        if (totalDuration > 0 && elapsedDuration > 0) {
          const expectedProgressRatio = Math.min(1, elapsedDuration / totalDuration);
          const expectedAmount = targetAmount * expectedProgressRatio;
          isOnTrack = currentAmount >= expectedAmount;
        }
      }

      return {
        id: goal.id,
        name: goal.name,
        description: goal.description,
        targetAmount,
        currentAmount,
        startDate: goal.start_date,
        deadline: goal.deadline,
        completedAt: goal.completed_at,
        status: goal.status,
        priority: goal.priority,
        icon: goal.icon,
        color: goal.color,
        categoryId: goal.category_id,
        savingWalletId: goal.saving_wallet_id,
        // Virtual fields
        remainingAmount: parseFloat(remainingAmount.toFixed(2)),
        percentageComplete: parseFloat(percentageComplete.toFixed(2)),
        daysUntilDeadline,
        monthlyRequired: parseFloat(monthlyRequired.toFixed(2)),
        isOnTrack
      };
    });

    res.status(200).json({
      success: true,
      data: formattedGoals
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Membuat Target Tabungan Baru
 */
export const createGoal = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
      name,
      description,
      targetAmount,
      startDate = new Date().toISOString(),
      deadline,
      priority = 'medium',
      icon,
      color,
      categoryId = null,
      savingWalletId = null
    } = req.body;

    if (!name || !targetAmount) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Nama target dan nominal target wajib diisi' }
      });
      return;
    }

    const { data: newGoal, error } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        name,
        description,
        target_amount: targetAmount,
        start_date: startDate,
        deadline,
        priority,
        icon,
        color,
        category_id: categoryId,
        saving_wallet_id: savingWalletId,
        status: 'active'
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
        id: newGoal.id,
        name: newGoal.name,
        targetAmount: parseFloat(newGoal.target_amount),
        status: newGoal.status
      }
    });
  } catch (error) {
    next(error);
  }
};
