import 'fastify';

declare module 'fastify' {
  interface FastifySchema {
    description?: string;
    tags?: string[];
    summary?: string;
    consumes?: string[];
  }
}
