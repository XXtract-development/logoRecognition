/**
 * Reference Logos Routes Tests — ATDD RED PHASE (Epic 7, Story 7.3)
 *
 * Failing acceptance tests, generated BEFORE implementation (TDD red phase).
 * Elke test is geskipt met `it.skip`; verwijder de `.skip` per test zodra
 * Story 7.3 geïmplementeerd is.
 *
 * Contract (Story 7.3 — FR43):
 *   POST  /api/v1/reference-logos              multipart { file, t3777Code, variantLabel,
 *         source } → 201 { id, t3777Code, variantLabel, storagePath, active: true }
 *   GET   /api/v1/reference-logos?code=...     → 200 { data: [varianten incl. preview-url] }
 *   PATCH /api/v1/reference-logos/:id/deactivate → 200 { id, active: false } (soft delete)
 *   Validatie: niet-PNG/SVG → 400 · resolutie onder minimum → 400
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import { mockUser } from '../helpers/mock-data';

// Sharp is mocked so resolution validation is deterministic: every test sends
// the same header-only 1x1 PNG, but the success case must read as a valid
// large image while the resolution test must read as too small. The default
// metadata makes uploads pass; the resolution test overrides it to 1x1.
const sharpMetadata = vi.fn(async () => ({ width: 512, height: 512, format: 'png' }));
vi.mock('sharp', () => ({
  default: vi.fn(() => ({ metadata: sharpMetadata })),
}));

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;

const mockReferenceLogo = {
  id: 'b1b2c3d4-0000-0000-0000-000000000001',
  t3777Code: 'EU_ORGANIC_FARMING',
  variantLabel: 'kleur-nl',
  source: 'https://agriculture.ec.europa.eu/farming/organic-farming/organic-logo_en',
  storagePath: 'reference-logos/EU_ORGANIC_FARMING/kleur-nl.png',
  active: true,
  createdAt: new Date('2026-06-03T10:00:00Z'),
};

/** Minimale geldige 1x1 PNG (magic bytes + IHDR) voor multipart-payloads. */
function pngBuffer(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
    'hex',
  );
}

function multipartPayload(fields: Record<string, string>, fileName = 'logo.png') {
  const boundary = '----atddboundary';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    );
  }
  const fileHeader =
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: image/png\r\n\r\n`;
  const body = Buffer.concat([
    Buffer.from(parts.join('')),
    Buffer.from(fileHeader),
    pngBuffer(),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    payload: body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('Reference Logos Routes (ATDD RED — Story 7.3)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    sharpMetadata.mockResolvedValue({ width: 512, height: 512, format: 'png' });
    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 10 } });

    app.addHook('preHandler', async (request) => {
      (request as any).user = {
        userId: mockUser.id,
        email: mockUser.email,
        role: 'USER',
      };
    });

    // Route-module bestaat nog niet (red phase): dynamic import met vangnet,
    // zodat dit testbestand laadbaar blijft tot Story 7.3 geïmplementeerd is.
    try {
      const { referenceLogosRoutes } = await import('../../api/v1/reference-logos');
      await app.register(referenceLogosRoutes, { prefix: '/api/v1' });
    } catch {
      // Module ontbreekt nog — alle tests hieronder staan op .skip (RED).
    }
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  describe('POST /reference-logos', () => {
    it('should upload a reference logo with T3777 code and variant metadata', async () => {
      (mockPrisma.referenceLogo.create as vi.Mock).mockResolvedValue(mockReferenceLogo);

      const { payload, headers } = multipartPayload({
        t3777Code: 'EU_ORGANIC_FARMING',
        variantLabel: 'kleur-nl',
        source: mockReferenceLogo.source,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reference-logos',
        payload,
        headers,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.t3777Code).toBe('EU_ORGANIC_FARMING');
      expect(body.variantLabel).toBe('kleur-nl');
      expect(body.active).toBe(true);
      expect(body.storagePath).toMatch(/^reference-logos\//);
    });

    // Story 12.10 (AC3) — de curatie-upload zet field_type/gs1_field expliciet
    // uit de code-mapping, niet de schema-default.
    it('should set field_type/gs1_field from the code mapping on create (AC3)', async () => {
      (mockPrisma.referenceLogo.create as vi.Mock).mockResolvedValue({
        ...mockReferenceLogo,
        t3777Code: 'VEGAN',
      });

      const { payload, headers } = multipartPayload({
        t3777Code: 'VEGAN',
        variantLabel: 'kleur-nl',
        source: 'https://example.com/vegan-logo',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reference-logos',
        payload,
        headers,
      });

      expect(response.statusCode).toBe(201);
      expect(mockPrisma.referenceLogo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            t3777Code: 'VEGAN',
            fieldType: 'DietTypeCode',
            gs1Field: 'dietTypeCode',
          }),
        }),
      );
    });

    it('should reject non-PNG/SVG uploads with 400', async () => {
      const { payload, headers } = multipartPayload(
        { t3777Code: 'EU_ORGANIC_FARMING', variantLabel: 'kleur-nl', source: 'x' },
        'logo.docx',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reference-logos',
        payload,
        headers,
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toMatch(/formaat|format/i);
    });

    it('should reject images below the minimum resolution with 400', async () => {
      // De 1x1 test-PNG zit per definitie onder elk redelijk resolutie-minimum:
      // Sharp leest hier expliciet 1x1 zodat de resolutie-check afslaat.
      sharpMetadata.mockResolvedValue({ width: 1, height: 1, format: 'png' });
      const { payload, headers } = multipartPayload({
        t3777Code: 'EU_ORGANIC_FARMING',
        variantLabel: 'kleur-nl',
        source: 'x',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reference-logos',
        payload,
        headers,
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toMatch(/resolutie|resolution/i);
    });

    it('should require t3777Code and variantLabel fields', async () => {
      const { payload, headers } = multipartPayload({ source: 'x' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reference-logos',
        payload,
        headers,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /reference-logos?code=', () => {
    it('should list all variants for a T3777 code including inactive ones', async () => {
      (mockPrisma.referenceLogo.findMany as vi.Mock).mockResolvedValue([
        mockReferenceLogo,
        { ...mockReferenceLogo, id: 'b1b2c3d4-0000-0000-0000-000000000002', variantLabel: 'mono', active: false },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reference-logos?code=EU_ORGANIC_FARMING',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body.data.map((v: { variantLabel: string }) => v.variantLabel)).toContain('mono');
      // historie blijft: inactieve varianten worden meegegeven met active=false
      expect(body.data.some((v: { active: boolean }) => v.active === false)).toBe(true);
    });
  });

  describe('PATCH /reference-logos/:id/deactivate', () => {
    it('should soft-delete a variant (active=false, record blijft bestaan)', async () => {
      (mockPrisma.referenceLogo.update as vi.Mock).mockResolvedValue({
        ...mockReferenceLogo,
        active: false,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/reference-logos/${mockReferenceLogo.id}/deactivate`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).active).toBe(false);
      expect(mockPrisma.referenceLogo.delete).not.toHaveBeenCalled();
    });
  });
});
