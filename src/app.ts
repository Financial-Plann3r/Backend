import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes';
import { errorHandler } from './middlewares/errorMiddleware';
import { startRecurringScheduler } from './config/cronScheduler';

// Load environment variables
dotenv.config();

// Start recurring transactions cron job scheduler
startRecurringScheduler();

const app: Application = express();

// Basic Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint at root
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    message: 'Express TypeScript API is running.',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Main API Router mounted under /api
app.use('/api', apiRouter);

// Fallback for 404 Not Found
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Resource not found: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use(errorHandler);

export default app;
