import { test, expect } from '@playwright/test';

test('GET / returns service info', async ({ request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
});

test('GET /health returns 200', async ({ request }) => {
  const response = await request.get('/health');
  expect(response.status()).toBe(200);
});

test('GET /ml/models returns 200', async ({ request }) => {
  const response = await request.get('/ml/models');
  expect(response.status()).toBe(200);
});
