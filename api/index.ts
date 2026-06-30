import app from '../src/app';

const PORT = process.env.PORT || 3000;

// Only spin up the listener if we're not running in serverless (e.g. Vercel production serverless function)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`[server]: Local server is running at http://localhost:${PORT}`);
  });
}

// Vercel serverless functions require the Express app instance to be exported
export default app;
