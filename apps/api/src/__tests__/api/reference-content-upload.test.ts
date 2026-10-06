import { beforeEach, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import prisma from '../../core/db';
import { uploadReferenceLogo } from '../../services/storage';
import { referenceLogosRoutes } from '../../api/v1/reference-logos';

beforeEach(() => vi.clearAllMocks());
it.each(['blank', 'frame', 'corrupt', 'svg-blank', 'oversized-png', 'oversized-svg'])('rejects %s reference upload before storage/database writes', async (kind) => {
  const app = Fastify();
  await app.register(multipart);
  await app.register(referenceLogosRoutes);
  const body = kind === 'frame' ? '<rect x="1" y="1" width="254" height="254" fill="none" stroke="black"/>' : '';
  const vector = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${kind === 'oversized-svg' ? 5000 : 256}" height="${kind === 'oversized-svg' ? 5000 : 256}">${body}</svg>`);
  const bytes = kind === 'oversized-png' ? fs.readFileSync(path.resolve(__dirname, '../../../../ml-service/tests/fixtures/reference-content/oversized-declared.png')) : kind === 'corrupt' ? Buffer.from('corrupt') : kind.endsWith('svg') || kind === 'svg-blank' ? vector : await sharp(vector).png().toBuffer();
  const boundary = 'content-test';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="t3777Code"\r\n\r\nEU_ORGANIC_FARMING\r\n--${boundary}\r\nContent-Disposition: form-data; name="variantLabel"\r\n\r\ncontent-test\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="reference.${kind.endsWith('svg') || kind === 'svg-blank' ? 'svg' : 'png'}"\r\nContent-Type: image/png\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await app.inject({ method: 'POST', url: '/reference-logos', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  expect(response.statusCode).toBe(400);
  expect(uploadReferenceLogo).not.toHaveBeenCalled();
  expect(prisma.referenceLogo.create).not.toHaveBeenCalled();
  expect(prisma.referenceLogo.findUnique).not.toHaveBeenCalled();
  await app.close();
});
