import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const wsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/media/stream', { websocket: true }, (conn, req) => {
    app.log.info({ msg: 'WS connected', url: req.url });
    conn.socket.on('message', (msg: unknown) => {
      // Echo back
      conn.socket.send(msg as any);
    });
    conn.socket.on('close', () => {
      app.log.info('WS closed');
    });
  });
};

export default wsRoutes;
