// Minimal server skeleton for the AI agent to complete.
// Do NOT add business logic here; keep routes thin and delegate to src/lib/*.
import Fastify from 'fastify';
import formbody from '@fastify/formbody';
import websocket from '@fastify/websocket';
import { config } from 'dotenv';
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

// Voice webhooks (Twilio-compatible). The AI agent will implement the handlers.
app.post('/voice/inbound', async (req, reply) => {
  // TODO: validate Twilio signature (if present)
  // TODO: respond with TwiML to whisper and forward on '*'
  reply.type('text/xml').send('<Response><Say>Stub inbound</Say></Response>');
});

app.post('/voice/assistant', async (req, reply) => {
  // TODO: start assistant leg, rate-limit check, return initial TwiML
  reply.type('text/xml').send('<Response><Say>Hi, I am ImperialX\'s assistant.</Say></Response>');
});

// Media stream (upgrade later to handle audio frames)
app.get('/media/stream', { websocket: true }, (conn, req) => {
  conn.socket.on('message', (msg: unknown) => {
    // Echo for now
    conn.socket.send(msg as any);
  });
});

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});