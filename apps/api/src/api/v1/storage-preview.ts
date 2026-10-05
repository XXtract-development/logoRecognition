import { FastifyInstance } from 'fastify';
import { readPreviewImage, StoragePreviewError, verifyPreviewSignature } from '../../services/storage';

interface PreviewQuery { bucket: string; key: string; expires: string; signature: string }

export async function storagePreviewRoutes(app: FastifyInstance): Promise<void> {
  app.get<{Querystring: PreviewQuery}>('/storage/preview', {
    schema: {querystring: {type: 'object', required: ['bucket','key','expires','signature'], additionalProperties: false,
      properties: {bucket: {type:'string', maxLength:64}, key: {type:'string', maxLength:1024},
        expires: {type:'string', maxLength:16}, signature: {type:'string', maxLength:128}}}},
  }, async (request, reply) => {
    try {
      const {bucket, key, expires, signature} = request.query;
      if (!verifyPreviewSignature(bucket, key, expires, signature)) return reply.code(403).send({error:'Invalid or expired preview'});
      const image = await readPreviewImage(bucket, key);
      return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff')
        .header('Content-Security-Policy',"default-src 'none'; frame-ancestors 'self'")
        .header('Content-Disposition','inline').type(image.mimeType).send(image.buffer);
    } catch (error) {
      return reply.code(error instanceof StoragePreviewError ? error.statusCode : 503).send({error:'Preview unavailable'});
    }
  });
}
