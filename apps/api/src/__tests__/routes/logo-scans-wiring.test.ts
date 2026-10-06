// Story 1.1 — registration, regression of neighbouring routes, ml-service not published (AD-3)
vi.unmock('../../middleware/auth');
import fs from 'fs';
import path from 'path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { logoScanRoutes } from '../../api/v1/logo-scans';
import { ghsReviewRoutes } from '../../api/v1/ghs-review';

const originalEnv = { ...process.env };
const repoRoot = path.resolve(__dirname, '../../../../..');
beforeEach(() => { process.env.LOGO_PIPELINE_KEYS = 'n8n:test-key-1'; process.env.PIPELINE_SERVICE_KEY = 'p'.repeat(32); });
afterEach(() => { process.env = { ...originalEnv }; });

describe('wiring', () => {
  it('main.ts registers logoScanRoutes under /api/v1', () => {
    const main = fs.readFileSync(path.join(repoRoot, 'apps/api/src/main.ts'), 'utf8');
    expect(main).toMatch(/app\.register\(logoScanRoutes, \{ prefix: '\/api\/v1' \}\)/);
  });
  it('main.ts starts the logo-scan cleanup scheduler', () => {
    const main = fs.readFileSync(path.join(repoRoot, 'apps/api/src/main.ts'), 'utf8');
    expect(main).toMatch(/import \{[^}]*registerLogoScanCleanup[^}]*\} from '\.\/services\/pipeline\/logo-scan-cleanup'/);
    expect(main).toMatch(/registerLogoScanCleanup\(\)/);
  });
  it('a logo-scans key does not open /ghs/review, and ghs-review keeps its own auth', async () => {
    const server = Fastify();
    await server.register(cookie);
    await server.register(logoScanRoutes, { prefix: '/api/v1' });
    await server.register(ghsReviewRoutes, { prefix: '/api/v1' });
    const body = { image: 'x', mimeType: 'image/png' };
    const wrong = await server.inject({ method: 'POST', url: '/api/v1/ghs/review', headers: { 'x-api-key': 'test-key-1' }, payload: body });
    expect(wrong.statusCode).toBe(401);
    const none = await server.inject({ method: 'POST', url: '/api/v1/ghs/review', payload: body });
    expect(none.statusCode).toBe(401);
    await server.close();
  });
});

describe('ml-service is not published through the gateway', () => {
  const block = (file: string) => {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const m = text.match(/^ {2}ml-service:\n([\s\S]*?)(?=^ {2}\S|^\S|(?![\s\S]))/m);
    return m ? m[1] : '';
  };
  // docker-compose.yml / .full.yml are local development stacks and publish ports by design.
  for (const file of ['docker-compose.prod.yml', 'docker-compose.acc.yml', 'docker-compose.test.yml']) {
    it(`${file}: ml-service has no published ports and no proxy router`, () => {
      const b = block(file);
      expect(b.length).toBeGreaterThan(0);
      expect(b).not.toMatch(/^\s+ports:/m);
      expect(b).not.toMatch(/traefik\./);
      expect(b).not.toMatch(/^\s+expose:/m);
      expect(b).not.toMatch(/proxy/);
    });
  }
  it('known risk marker: acc/test ml-service runs on the host network (firewall decides reachability)', () => {
    for (const f of ['docker-compose.acc.yml', 'docker-compose.test.yml']) expect(block(f)).toMatch(/network_mode:\s*host/);
    expect(block('docker-compose.prod.yml')).not.toMatch(/network_mode/);
  });
  it('docker-compose.prod.yml: ml-service sits only on internal/egress networks, not the proxy', () => {
    const b = block('docker-compose.prod.yml');
    expect(b).toMatch(/networks: \[private, ml-egress\]/);
    expect(b).not.toMatch(/proxy/);
  });
});
