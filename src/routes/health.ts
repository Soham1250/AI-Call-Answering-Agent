import { FastifyInstance } from 'fastify';
import mongoose from 'mongoose';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Database health check
  fastify.get('/db', async (request, reply) => {
    try {
      if (!mongoose.connection.db) {
        return { ok: false, error: 'Database connection not established' };
      }
      await mongoose.connection.db.admin().ping();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}
