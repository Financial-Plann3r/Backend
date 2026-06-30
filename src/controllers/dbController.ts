import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Fetch records from a specified database table (sample template handler)
 */
export const getTableRecords = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tableName } = req.params;

    if (!tableName || typeof tableName !== 'string') {
      res.status(400).json({
        status: 'error',
        message: 'Table name parameter is required and must be a string'
      });
      return;
    }

    // Query data from Supabase. Note: Query permissions are subject to your Supabase RLS policies.
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(100);

    if (error) {
      res.status(400).json({
        status: 'error',
        message: error.message
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      count: data.length,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Insert record into a specified database table (sample template handler)
 */
export const insertTableRecord = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { tableName } = req.params;
    const payload = req.body;

    if (!tableName || typeof tableName !== 'string' || !payload) {
      res.status(400).json({
        status: 'error',
        message: 'Table name (string) and payload body are required'
      });
      return;
    }

    // Insert payload to database. Note: Insert permissions are subject to your Supabase RLS policies.
    const { data, error } = await supabase
      .from(tableName)
      .insert(payload)
      .select();

    if (error) {
      res.status(400).json({
        status: 'error',
        message: error.message
      });
      return;
    }

    res.status(201).json({
      status: 'success',
      message: `Successfully inserted record into ${tableName}`,
      data
    });
  } catch (error) {
    next(error);
  }
};
