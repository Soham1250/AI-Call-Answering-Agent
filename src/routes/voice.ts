import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

const voiceRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Dev mirrors (GET) for browser testing
  app.get('/inbound', async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Voice Inbound (DEV)</title></head>
  <body>
    <h1>/voice/inbound (DEV)</h1>
    <p>This endpoint expects a POST from Twilio. For convenience, submit this form:</p>
    <form method="post" action="/voice/inbound">
      <button type="submit">POST /voice/inbound</button>
    </form>
  </body>
</html>`);
  });

  app.get('/assistant', async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Voice Assistant (DEV)</title></head>
  <body>
    <h1>/voice/assistant (DEV)</h1>
    <p>This endpoint expects a POST from Twilio. For convenience, submit this form:</p>
    <form method="post" action="/voice/assistant">
      <button type="submit">POST /voice/assistant</button>
    </form>
  </body>
</html>`);
  });

  // Twilio-compatible POST routes
  app.post('/inbound', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', 'text/xml');
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Press star to forward to ImperialX's assistant.</Say>
  <Gather input="dtmf" numDigits="1" timeout="5" action="/voice/assistant" method="POST" />
</Response>`;
    return reply.send(twiml);
  });

  app.post('/assistant', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', 'text/xml');
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Hi, I am ImperialX's assistant. Please press 1 for English, 2 for Hindi, 3 for Marathi.</Say>
  <Gather input="dtmf" numDigits="1" timeout="5" action="/voice/language" method="POST" />
</Response>`;
    return reply.send(twiml);
  });

  app.post('/language', async (req: FastifyRequest, reply: FastifyReply) => {
    // Twilio sends application/x-www-form-urlencoded; formbody plugin parses into req.body
    const body: any = (req as any).body || {};
    const digits = String(body.Digits || '').trim();

    const map: Record<string, { locale: string; sayLang: string }> = {
      '1': { locale: 'en-IN', sayLang: 'en-IN' },
      '2': { locale: 'hi-IN', sayLang: 'hi-IN' },
      '3': { locale: 'mr-IN', sayLang: 'mr-IN' },
    };
    const sel = map[digits] || map['1'];

    reply.header('Content-Type', 'text/xml');
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say xml:lang="${sel.sayLang}">Thank you. Proceeding.</Say>
  <Pause length="1"/>
  <Say xml:lang="${sel.sayLang}">You can speak after the beep.</Say>
  <Play>https://api.twilio.com/cowbell.mp3</Play>
</Response>`;
    return reply.send(twiml);
  });
};

export default voiceRoutes;
