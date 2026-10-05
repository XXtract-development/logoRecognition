/** Proves PostgreSQL cancels the catalog deadline on the same transaction connection. */
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const db = new PrismaClient();
beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Disposable local database required');
});
afterAll(async () => { await db.$disconnect(); });

describe('actual PostgreSQL catalog query deadline', () => {
  it('cancels a delayed SQL operation and restores transaction-local setting', async () => {
    const before = await db.$queryRaw<Array<{ statement_timeout: string }>>`SHOW statement_timeout`;
    const start = Date.now();
    let error: unknown;
    try {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('statement_timeout', ${'50'}, true)`;
        await tx.$queryRaw`SELECT 1 AS result FROM pg_sleep(2)`;
      }, { maxWait: 1000, timeout: 5000 });
    } catch (caught) { error = caught; }
    expect(error).toBeDefined();
    expect(JSON.stringify(error)).toContain('57014');
    expect(Date.now() - start).toBeLessThan(1500);
    const after = await db.$queryRaw<Array<{ statement_timeout: string }>>`SHOW statement_timeout`;
    expect(after).toEqual(before);
    expect(await db.$queryRaw`SELECT 1 AS result`).toEqual([{ result: 1 }]);
  });
});
