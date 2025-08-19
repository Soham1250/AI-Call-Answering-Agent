// Minimal server skeleton for the AI agent to complete.
// Do NOT add business logic here; keep routes thin and delegate to src/lib/*.
import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import websocket from '@fastify/websocket';
import { config } from 'dotenv';
import { connectMongo } from './lib/mongo.js';
config();

const app = Fastify({ logger: true });
await app.register(formbody);
await app.register(websocket);

// Health check
app.get('/health', async () => ({
  ok: true,
  ts: new Date().toISOString(),
  services: {
    tts: {
      ok: !!(process.env.TTS_KEY && process.env.AZURE_REGION),
      provider: 'azure',
      region: process.env.AZURE_REGION || 'not configured'
    }
  }
}));

// TTS Health Check
app.get('/health/tts', async () => ({
  ok: !!(process.env.TTS_KEY && process.env.AZURE_REGION),
  provider: 'azure',
  region: process.env.AZURE_REGION || 'not configured'
}));

// Voice routes (Twilio-compatible)
await app.register((await import('./routes/voice')).default as any, { prefix: '/voice' });

// Health routes
await app.register((await import('./routes/health')).default as any, { prefix: '/health' });

// Debug routes
await app.register((await import('./routes/debug')).default as any, { prefix: '/debug' });

// Media stream (WebSocket) echo stub
await app.register((await import('./routes/ws')).default as any);

// Connect to MongoDB before starting the server
try {
  await connectMongo();
} catch (err) {
  app.log.error('Failed to connect to MongoDB: ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});