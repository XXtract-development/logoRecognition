/**
 * Health API E2E Tests
 *
 * Tests for all health check endpoints:
 * - GET /health — basic health check
 * - GET /health/ready — Kubernetes readiness probe
 * - GET /health/live — Kubernetes liveness probe
 * - GET /health/detailed — detailed service status report
 *
 * Environment: ACC (BASE_URL=https://logo-detection.acc.xxtract.com)
 * All tests use Playwright's APIRequestContext — no browser navigation required.
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiBase(): string {
  return process.env.BASE_URL || 'http://localhost:5173';
}

async function isApiReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${apiBase()}/health`);
    return res.ok();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// GET /health — Basic Health Check
// ---------------------------------------------------------------------------

test.describe('Health API — GET /health', () => {
  test.setTimeout(15_000);

  test('returns 200 with status "ok"', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('string');
  });

  test('timestamp is a valid ISO 8601 date', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health`);
    const body = await res.json();

    const date = new Date(body.timestamp);
    expect(date.getTime()).not.toBeNaN();
  });

  test('responds quickly (under 500ms)', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const start = performance.now();
    await request.get(`${apiBase()}/health`);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// GET /health/ready — Readiness Probe
// ---------------------------------------------------------------------------

test.describe('Health API — GET /health/ready', () => {
  test.setTimeout(15_000);

  test('returns 200 or 503 depending on ML service availability', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/ready`);

    // 200 = ready (ML service healthy), 503 = not ready (ML service down)
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty('status');

    if (res.status() === 200) {
      expect(body.status).toBe('ready');
      expect(body).toHaveProperty('timestamp');
    } else {
      expect(body.status).toBe('not_ready');
      expect(body).toHaveProperty('reason');
    }
  });

  test('returns structured JSON response body', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/ready`);
    const body = await res.json();

    // Regardless of status, body should have a status field
    expect(body).toHaveProperty('status');
    expect(typeof body.status).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// GET /health/live — Liveness Probe
// ---------------------------------------------------------------------------

test.describe('Health API — GET /health/live', () => {
  test.setTimeout(15_000);

  test('returns 200 with status "alive"', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/live`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('status', 'alive');
    expect(body).toHaveProperty('timestamp');
  });

  test('liveness probe always returns 200 when service is running', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    // Liveness should always succeed if the process is alive
    // Run multiple times to ensure consistency
    for (let i = 0; i < 3; i++) {
      const res = await request.get(`${apiBase()}/health/live`);
      expect(res.status()).toBe(200);
    }
  });
});

// ---------------------------------------------------------------------------
// GET /health/detailed — Detailed Health Report
// ---------------------------------------------------------------------------

test.describe('Health API — GET /health/detailed', () => {
  test.setTimeout(15_000);

  test('returns 200 or 503 with structured health status', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/detailed`);

    // 200 = healthy/degraded, 503 = unhealthy
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(body.status);
  });

  test('returns timestamp, version, and uptime fields', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/detailed`);
    const body = await res.json();

    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('string');

    expect(body).toHaveProperty('version');
    expect(typeof body.version).toBe('string');

    expect(body).toHaveProperty('uptime');
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  test('returns services object with ml-service status', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/detailed`);
    const body = await res.json();

    expect(body).toHaveProperty('services');
    expect(typeof body.services).toBe('object');

    // ml-service should always be reported
    expect(body.services).toHaveProperty('ml-service');
    const ml = body.services['ml-service'];
    expect(ml).toHaveProperty('status');
    expect(['up', 'down', 'unknown']).toContain(ml.status);
  });

  test('ml-service reports model details when healthy', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/detailed`);
    const body = await res.json();

    const ml = body.services['ml-service'];
    if (ml.status === 'up') {
      expect(ml).toHaveProperty('latency_ms');
      expect(typeof ml.latency_ms).toBe('number');
      expect(ml).toHaveProperty('details');
      expect(ml.details).toHaveProperty('models_loaded');
    }
    // If ML is down, we just log it — not a test failure
  });

  test('reports socket-io service status', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/detailed`);
    const body = await res.json();

    expect(body.services).toHaveProperty('socket-io');
    const socketIo = body.services['socket-io'];
    expect(socketIo).toHaveProperty('status');
    expect(['up', 'down', 'unknown']).toContain(socketIo.status);
  });

  test('reports postgresql status when DATABASE_URL is configured', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/detailed`);
    const body = await res.json();

    // PostgreSQL may or may not be present depending on configuration
    if (body.services.postgresql) {
      expect(body.services.postgresql).toHaveProperty('status');
      expect(['up', 'down', 'unknown']).toContain(body.services.postgresql.status);

      if (body.services.postgresql.status === 'up') {
        expect(body.services.postgresql).toHaveProperty('latency_ms');
        expect(typeof body.services.postgresql.latency_ms).toBe('number');
      }
    }
  });

  test('overall status reflects service health correctly', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const res = await request.get(`${apiBase()}/health/detailed`);
    const body = await res.json();

    const serviceStatuses = Object.values(body.services).map(
      (s: any) => s.status
    );

    if (serviceStatuses.includes('down')) {
      // If any service is down, overall should be unhealthy
      expect(body.status).toBe('unhealthy');
    } else if (serviceStatuses.includes('unknown')) {
      // If any is unknown but none down, should be degraded
      expect(body.status).toBe('degraded');
    } else {
      // All up — should be healthy
      expect(body.status).toBe('healthy');
    }
  });
});
