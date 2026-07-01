import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Mendapatkan Profil User dari tabel users public
 */
export const getProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    // Ambil data dari tabel users public
    let { data: profile, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: error.message }
      });
      return;
    }

    // Jika belum ada di tabel public, buat record baru (auto-onboarding / auto-create)
    if (!profile) {
      const email = req.user?.email || '';
      const displayName = req.user?.user_metadata?.full_name || req.user?.user_metadata?.display_name || email.split('@')[0];
      const photoUrl = req.user?.user_metadata?.avatar_url || null;

      const { data: newProfile, error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email,
          display_name: displayName,
          photo_url: photoUrl
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
      profile = newProfile;
    }

    // Petakan ke camelCase untuk kebutuhan frontend
    res.status(200).json({
      success: true,
      data: {
        id: profile.id,
        email: profile.email,
        displayName: profile.display_name,
        photoUrl: profile.photo_url,
        preferences: profile.preferences,
        plan: profile.plan,
        planExpiresAt: profile.plan_expires_at,
        isActive: profile.is_active,
        isOnboardingComplete: profile.is_onboarding_complete,
        onboardingCompletedAt: profile.onboarding_completed_at,
        setupProgress: profile.setup_progress,
        referralCode: profile.referral_code,
        referredBy: profile.referred_by,
        referralCount: profile.referral_count,
        referralRewardClaimed: profile.referral_reward_claimed,
        lastLoginAt: profile.last_login_at,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update Profil / Preferensi User
 */
export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User tidak terautentikasi' }
      });
      return;
    }

    const { displayName, photoUrl, preferences, isOnboardingComplete, setupProgress } = req.body;

    const updatePayload: any = {};
    if (displayName !== undefined) updatePayload.display_name = displayName;
    if (photoUrl !== undefined) updatePayload.photo_url = photoUrl;
    if (preferences !== undefined) updatePayload.preferences = preferences;
    if (isOnboardingComplete !== undefined) {
      updatePayload.is_onboarding_complete = isOnboardingComplete;
      if (isOnboardingComplete) {
        updatePayload.onboarding_completed_at = new Date().toISOString();
      }
    }
    if (setupProgress !== undefined) updatePayload.setup_progress = setupProgress;
    updatePayload.updated_at = new Date().toISOString();

    const { data: updatedProfile, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      res.status(400).json({
        success: false,
        error: { code: 'UPDATE_FAILED', message: error.message }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: updatedProfile.id,
        email: updatedProfile.email,
        displayName: updatedProfile.display_name,
        photoUrl: updatedProfile.photo_url,
        preferences: updatedProfile.preferences,
        plan: updatedProfile.plan,
        planExpiresAt: updatedProfile.plan_expires_at,
        isActive: updatedProfile.is_active,
        isOnboardingComplete: updatedProfile.is_onboarding_complete,
        onboardingCompletedAt: updatedProfile.onboarding_completed_at,
        setupProgress: updatedProfile.setup_progress,
        createdAt: updatedProfile.created_at,
        updatedAt: updatedProfile.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
};
