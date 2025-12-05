import { test, expect } from '@playwright/test';

test('homepage loads successfully', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  const title = await page.title();
  console.log('Page title:', title);

  expect(title).toContain('XXtract');
});

test('API health check works', async ({ request }) => {
  const response = await request.get('http://localhost:8000/health');

  expect(response.ok()).toBeTruthy();
  expect(response.status()).toBe(200);

  const data = await response.json();
  console.log('Health check:', data);

  expect(data.status).toBe('ok');
});
