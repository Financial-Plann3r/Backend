import { User } from '@supabase/supabase-js';

// Extend Express Request namespace globally to include the optional user object
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
