import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Handle User Sign Up
 */
export const signUp = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      res.status(400).json({
        status: 'error',
        message: error.message
      });
      return;
    }

    res.status(201).json({
      status: 'success',
      message: 'User signed up successfully. Check verification email if enabled.',
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle User Sign In
 */
export const signIn = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      res.status(400).json({
        status: 'error',
        message: error.message
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Authenticated User Profile
 */
export const getProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    // req.user was populated by requireAuth middleware
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user
      }
    });
  } catch (error) {
    next(error);
  }
};
