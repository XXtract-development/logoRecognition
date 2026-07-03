/**
 * Story 16.3 — GET /api/v1/flywheel/reports/data-quality (route-flow).
 *
 * AC→test-mapping (zie ac-trace-16-3.md):
 *   AC1 → JSON-respons, CSV-download-headers, periode-/GLN-query doorgegeven aan
 *         de service, lege-periode-respons; ADMIN-only.
 *
 * De rapport-service heeft eigen unit-tests; hier testen we het route-gedrag met
 * een gemockte service (parsing van query, headers, autorisatie).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';

const buildDataQualityReport = vi.fn();
const toDataQualityCsv = vi.fn();
vi.mock('../../services/flywheel/data-quality-report', () => ({
  buildDataQualityReport: (...a: unknown[]) => buildDataQualityReport(...a),
  toDataQualityCsv: (...a: unknown[]) => toDataQualityCsv(...a),
}));

// De overige flywheel-route-services zijn hier niet in beeld — mock de zwaarste
// weg zodat het routebestand laadt zonder side-effects.
vi.mock('../../services/flywheel/pause', () => ({
  getPauseState: vi.fn().mockResolvedValue({ paused: false, reason: null, since: null, by: null }),
}));

async function buildApp(role: 'ADMIN' | 'USER'): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: 'test-secret' });
  app.addHook('preHandler', async (request) => {
    (request as any).user = { userId: 'u1', email: 'a@b.c', role };
  });
  const { flywheelRoutes } = await import('../../api/v1/flywheel');
  await app.register(flywheelRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const EMPTY_REPORT = { from: null, to: null, gln: null, totalCases: 0, groups: [] };

describe('GET /api/v1/flywheel/reports/data-quality (Story 16.3 AC1)', () => {
  let app: FastifyInstance;
  beforeEach(() => {
    vi.clearAllMocks();
    buildDataQualityReport.mockResolvedValue(EMPTY_REPORT);
    toDataQualityCsv.mockReturnValue('gln,gtin,code,confidence,sourceFile,runId');
  });
  afterEach(async () => {
    if (app) await app.close();
  });

  it('JSON-respons → 200 met rapportmodel', async () => {
    buildDataQualityReport.mockResolvedValue({
      from: null,
      to: null,
      gln: null,
      totalCases: 1,
      groups: [{ gln: 'GLN-A', cases: [{ gtin: 'G1', code: 'E-1', confidence: 0.9, sourceFile: 'artwork-crops/G1/', runId: 'r1' }] }],
    });
    app = await buildApp('ADMIN');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/reports/data-quality' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalCases).toBe(1);
    expect(body.groups[0].gln).toBe('GLN-A');
    expect(body.groups[0].cases[0].sourceFile).toBe('artwork-crops/G1/');
  });

  it('CSV-export → 200 text/csv met download-header', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/flywheel/reports/data-quality?format=csv',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('data-quality-report.csv');
    expect(res.body).toContain('gln,gtin,code');
  });

  it('periode- en GLN-query worden geparsed en doorgegeven aan de service', async () => {
    app = await buildApp('ADMIN');
    await app.inject({
      method: 'GET',
      url: '/api/v1/flywheel/reports/data-quality?from=2026-07-01&to=2026-07-31&gln=GLN-X',
    });
    const arg = buildDataQualityReport.mock.calls[0][0];
    expect(arg.from).toEqual(new Date('2026-07-01'));
    expect(arg.to).toEqual(new Date('2026-07-31'));
    expect(arg.gln).toBe('GLN-X');
  });

  it('ongeldige datum → null (geen 500, filter genegeerd)', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/flywheel/reports/data-quality?from=not-a-date',
    });
    expect(res.statusCode).toBe(200);
    const arg = buildDataQualityReport.mock.calls[0][0];
    expect(arg.from).toBeNull();
  });

  it('lege periode → 200 met geldige lege respons', async () => {
    app = await buildApp('ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/flywheel/reports/data-quality?from=2020-01-01&to=2020-01-02',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalCases).toBe(0);
    expect(body.groups).toEqual([]);
  });

  it('niet-ADMIN → 403', async () => {
    app = await buildApp('USER');
    const res = await app.inject({ method: 'GET', url: '/api/v1/flywheel/reports/data-quality' });
    expect(res.statusCode).toBe(403);
  });
});
