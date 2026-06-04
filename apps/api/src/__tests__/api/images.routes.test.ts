/**
 * Image Library Routes Tests (Epic 8, Story 8.6)
 *
 * Focus: artwork-source LogoImage records (metadata.artworkSource=true) — the
 * synthetic markers created during training-data registration — must NEVER
 * appear in the Image Library listing nor count toward Total Images. They are
 * excluded at QUERY level so the same exclusion covers both the page of results
 * and the pagination total.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { PrismaClient } from '@prisma/client';
import { mockUser } from '../helpers/mock-data';

const mockPrisma = new PrismaClient() as vi.Mocked<PrismaClient>;

describe('Image Library Routes — artwork-source exclusion (Story 8.6)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    (mockPrisma.logoImage.findMany as vi.Mock).mockResolvedValue([]);
    (mockPrisma.logoImage.count as vi.Mock).mockResolvedValue(0);

    app = Fastify({ logger: false });
    await app.register(cookie, { secret: 'test-secret' });
    app.addHook('preHandler', async (request) => {
      (request as any).user = { userId: mockUser.id, email: mockUser.email, role: 'ADMIN' };
    });
    const { imageRoutes } = await import('../../api/v1/images');
    await app.register(imageRoutes, { prefix: '/api/v1' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  /** Pull the `where` object out of the (first) call to a mocked Prisma method. */
  function whereOf(mock: vi.Mock): any {
    expect(mock).toHaveBeenCalled();
    return mock.mock.calls[0][0].where;
  }

  /** True when the where-clause excludes metadata.artworkSource records. */
  function excludesArtworkSource(where: any): boolean {
    const clauses: any[] = where?.AND ?? [where];
    return clauses.some(
      (c) =>
        c?.metadata?.path?.[0] === 'artworkSource' &&
        // `not: true` filters out the records flagged as artwork source
        c?.metadata?.not === true
    );
  }

  it('excludes artwork-source records from the listing query', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/training/images' });

    expect(response.statusCode).toBe(200);
    expect(excludesArtworkSource(whereOf(mockPrisma.logoImage.findMany as vi.Mock))).toBe(true);
  });

  it('excludes artwork-source records from the Total Images count', async () => {
    await app.inject({ method: 'GET', url: '/api/v1/training/images' });

    expect(excludesArtworkSource(whereOf(mockPrisma.logoImage.count as vi.Mock))).toBe(true);
  });

  it('keeps the categoryId filter alongside the artwork-source exclusion', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/v1/training/images?categoryId=cat-123',
    });

    const where = whereOf(mockPrisma.logoImage.findMany as vi.Mock);
    expect(excludesArtworkSource(where)).toBe(true);

    const clauses: any[] = where.AND;
    const hasCategory = clauses.some(
      (c) => c?.metadata?.path?.[0] === 'categoryId' && c?.metadata?.equals === 'cat-123'
    );
    expect(hasCategory).toBe(true);
  });
});
