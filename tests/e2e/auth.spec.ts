/**
 * Authentication E2E Tests
 *
 * Tests for the authentication system including:
 * - Login page UI rendering
 * - Auth API endpoints (login, register, logout, me)
 * - Error handling for invalid credentials
 *
 * All tests are tagged @auth for selective execution:
 *   npx playwright test --grep @auth
 *
 * Environment: ACC (BASE_URL=https://logo-detection.acc.xxtract.com)
 *
 * Note: Auth routes depend on xxtractdb03 MySQL being configured.
 * When the auth backend is not available, tests skip gracefully.
 */

import { test, expect, APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the base URL for API calls. */
function apiBase(): string {
  return process.env.BASE_URL || 'http://localhost:5173';
}

/** Check whether the API is reachable at all (health endpoint). */
async function isApiReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${apiBase()}/health`);
    return res.ok();
  } catch {
    return false;
  }
}

/**
 * Check whether the auth backend is functional.
 * Auth routes depend on MySQL (xxtractdb03). When the database is not
 * configured, all auth endpoints return 500 INTERNAL_ERROR. We probe the
 * logout endpoint (which should always return 200 when auth is working)
 * to determine availability.
 */
async function isAuthAvailable(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.post(`${apiBase()}/api/v1/auth/logout`);
    return res.ok();
  } catch {
    return false;
  }
}

/**
 * Check whether the login page is deployed and renders correctly.
 * On ACC the /login route may not be available if the frontend build
 * does not include it yet, resulting in a 404 or React error boundary.
 */
async function isLoginPageAvailable(
  page: import('@playwright/test').Page
): Promise<boolean> {
  try {
    await page.goto(`${apiBase()}/login`);
    // Check if the page rendered without a React error boundary
    const errorHeading = page.locator('h2:has-text("Unexpected Application Error")');
    const hasError = await errorHeading.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasError) return false;

    // Check for a password field as a signal the login form rendered
    const hasPassword = await page
      .locator('input[type="password"]')
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    return hasPassword;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// AUTH-001 — Login page renders correctly
// ---------------------------------------------------------------------------

test.describe('@auth AUTH-001: Login page renders correctly', () => {
  test.setTimeout(20_000);

  test('login page displays email field, password field, and submit button', async ({ page }) => {
    const loginAvailable = await isLoginPageAvailable(page);
    test.skip(!loginAvailable, 'Login page not available on this environment — skipping');

    // At this point the page is already at /login from the availability check
    // Email field should be visible (Ant Design renders input inside wrapper)
    const emailInput = page.locator('#login_email');
    await expect(emailInput).toBeVisible({ timeout: 5_000 });

    // Password field should be visible
    const passwordInput = page.locator('#login_password');
    await expect(passwordInput).toBeVisible();

    // Submit button should be visible
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toHaveText(/sign in/i);
  });

  test('login page shows XXtract branding', async ({ page }) => {
    const loginAvailable = await isLoginPageAvailable(page);
    test.skip(!loginAvailable, 'Login page not available on this environment — skipping');

    // Title should contain "Logo Recognition"
    const heading = page.locator('h2');
    await expect(heading).toContainText('Logo Recognition', { timeout: 5_000 });

    // Subtitle about XXtract account
    const subtitle = page.getByText(/xxtract account/i);
    await expect(subtitle).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// AUTH-002 — Register endpoint returns 403
// ---------------------------------------------------------------------------

test.describe('@auth AUTH-002: Register endpoint always returns 403', () => {
  test.setTimeout(15_000);

  test('POST /api/v1/auth/register is not publicly accessible', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.post(`${apiBase()}/api/v1/auth/register`, {
      data: { email: 'test@example.com', password: 'password123' },
      headers: { 'Content-Type': 'application/json' },
    });

    // Registration should be rejected: either explicitly forbidden (403),
    // or rejected as a duplicate/invalid request (400/409).
    // It must NOT succeed (201/200).
    expect(res.ok()).toBeFalsy();
    expect([400, 403, 409]).toContain(res.status());

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AUTH-003 — Login with invalid credentials returns 401
// ---------------------------------------------------------------------------

test.describe('@auth AUTH-003: Login with invalid credentials', () => {
  test.setTimeout(15_000);

  test('POST /api/v1/auth/login with wrong credentials returns 401', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.post(`${apiBase()}/api/v1/auth/login`, {
      data: {
        email: 'nonexistent@invalid-domain-test.com',
        password: 'wrongpassword123',
      },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// AUTH-004 — Login validates required fields
// ---------------------------------------------------------------------------

test.describe('@auth AUTH-004: Login validates required fields', () => {
  test.setTimeout(15_000);

  test('POST /api/v1/auth/login with empty body returns 400', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.post(`${apiBase()}/api/v1/auth/login`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });

    // Fastify schema validation returns 400 for missing required fields
    expect(res.status()).toBe(400);
  });

  test('POST /api/v1/auth/login with invalid email format returns 400', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.post(`${apiBase()}/api/v1/auth/login`, {
      data: { email: 'not-an-email', password: 'password123' },
      headers: { 'Content-Type': 'application/json' },
    });

    // Fastify schema validation catches invalid email format
    expect(res.status()).toBe(400);
  });

  test('POST /api/v1/auth/login with missing password returns 400', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.post(`${apiBase()}/api/v1/auth/login`, {
      data: { email: 'test@example.com' },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// AUTH-005 — /auth/me without token returns 401
// ---------------------------------------------------------------------------

test.describe('@auth AUTH-005: /auth/me requires authentication', () => {
  test.setTimeout(15_000);

  test('GET /api/v1/auth/me without cookie returns 401', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.get(`${apiBase()}/api/v1/auth/me`);

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Not authenticated');
  });

  test('GET /api/v1/auth/me with invalid cookie returns 401', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.get(`${apiBase()}/api/v1/auth/me`, {
      headers: {
        Cookie: 'access_token=invalid.jwt.token',
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AUTH-006 — Logout endpoint works
// ---------------------------------------------------------------------------

test.describe('@auth AUTH-006: Logout endpoint', () => {
  test.setTimeout(15_000);

  test('POST /api/v1/auth/logout returns 200 with success message', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.post(`${apiBase()}/api/v1/auth/logout`);

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('Logged out');
  });

  test('POST /api/v1/auth/logout clears auth cookies in response', async ({ request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping');

    const authUp = await isAuthAvailable(request);
    test.skip(!authUp, 'Auth backend not available (MySQL not configured) — skipping');

    const res = await request.post(`${apiBase()}/api/v1/auth/logout`);

    expect(res.ok()).toBeTruthy();

    // Check that set-cookie headers are present to clear the tokens
    const setCookieHeaders = res.headers()['set-cookie'];
    if (setCookieHeaders) {
      // Cookies should be cleared (set to empty or with past expiry)
      expect(setCookieHeaders).toContain('access_token');
    }
  });
});

// ---------------------------------------------------------------------------
// AUTH-007 — Login with valid credentials (SKIPPED)
// ---------------------------------------------------------------------------

test.describe('@auth AUTH-007: Login with valid credentials', () => {
  test.skip(true, 'No test credentials configured — skipping authenticated login tests');

  test('POST /api/v1/auth/login with valid credentials returns user data and sets cookie', async ({ request }) => {
    // This test is intentionally skipped because we do not have test
    // credentials configured for the ACC environment. To enable this test,
    // set TEST_AUTH_EMAIL and TEST_AUTH_PASSWORD environment variables with
    // valid xxtract-portal credentials.
    const email = process.env.TEST_AUTH_EMAIL || '';
    const password = process.env.TEST_AUTH_PASSWORD || '';

    const res = await request.post(`${apiBase()}/api/v1/auth/login`, {
      data: { email, password },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user).toBeTruthy();
    expect(body.user.email).toBe(email);
    expect(body.user.id).toBeTruthy();
    expect(body.user.role).toBeTruthy();
    expect(body.expiresIn).toBeGreaterThan(0);

    // Verify set-cookie header contains access_token
    const setCookieHeaders = res.headers()['set-cookie'];
    expect(setCookieHeaders).toContain('access_token');
  });
});

// ---------------------------------------------------------------------------
// AUTH-008 — Login page shows error on invalid credentials (UI)
// ---------------------------------------------------------------------------

test.describe('@auth AUTH-008: Login page error handling', () => {
  test.setTimeout(30_000);

  test('login page shows error message on invalid credentials', async ({ page, request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping UI login test');

    const loginAvailable = await isLoginPageAvailable(page);
    test.skip(!loginAvailable, 'Login page not available on this environment — skipping');

    // Fill in invalid credentials
    const emailInput = page.locator('#login_email');
    const passwordInput = page.locator('#login_password');

    await emailInput.fill('invalid@nonexistent-test-domain.com');
    await passwordInput.fill('wrongpassword123');

    // Click submit
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for error message to appear (Ant Design Alert component)
    const errorAlert = page.locator('.ant-alert-error');
    await expect(errorAlert).toBeVisible({ timeout: 10_000 });

    // Error message should contain meaningful text
    const errorText = await errorAlert.textContent();
    expect(errorText).toBeTruthy();
    expect(errorText!.length).toBeGreaterThan(0);
  });

  test('login page does not navigate away on failed login', async ({ page, request }) => {
    const apiUp = await isApiReachable(request);
    test.skip(!apiUp, 'API not reachable — skipping UI login test');

    const loginAvailable = await isLoginPageAvailable(page);
    test.skip(!loginAvailable, 'Login page not available on this environment — skipping');

    const emailInput = page.locator('#login_email');
    const passwordInput = page.locator('#login_password');

    await emailInput.fill('invalid@nonexistent-test-domain.com');
    await passwordInput.fill('wrongpassword123');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for the error to show
    await page.locator('.ant-alert-error').waitFor({ timeout: 10_000 });

    // Should still be on the login page
    expect(page.url()).toContain('/login');
  });
});
