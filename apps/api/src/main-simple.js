import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({
  logger: true,
});

async function startServer() {
  try {
    // CORS
    await app.register(cors, {
      origin: '*',
    });

    // Simple health route
    app.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Start server
    const port = parseInt(process.env.PORT || '8000', 10);
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    console.log(`✅ API Server running at http://${host}:${port}`);
    console.log(`✅ Health check: http://${host}:${port}/health`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
