import { FastifyInstance } from 'fastify';
import CallSession from '../models/CallSession.js';

export default async function debugRoutes(fastify: FastifyInstance) {
  // MongoDB test endpoint
  fastify.get('/mongo', async (request, reply) => {
    try {
      const session = new CallSession({
        caller: "+910000000000",
        locale: "en-IN",
        outcome: "assistant"
      });
      
      const savedSession = await session.save();
      return { ok: true, id: savedSession._id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}
