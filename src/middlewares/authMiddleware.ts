import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

// Custom request interface extension locally (or globally in types directory)
export interface AuthenticatedRequest extends Request {
  user?: any; // You can type this more specifically once user schema is defined
}

export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing or invalid authorization header format'
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Call Supabase API to retrieve user data using the token
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Invalid or expired session token',
        details: error?.message
      });
      return;
    }

    // Attach the authenticated Supabase user data to the request object
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
