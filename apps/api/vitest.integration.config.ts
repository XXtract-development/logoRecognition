import { defineConfig } from 'vitest/config';

/**
 * Postgres-integratie-testconfig (Story 13.7).
 *
 * BEWUST GESCHEIDEN van vitest.config.ts: de standaard-suite laadt
 * `src/__tests__/setup.ts`, dat `@prisma/client` VOLLEDIG mockt
 * (`$queryRaw: vi.fn().mockResolvedValue([])`). Daardoor wordt ruwe SQL nooit
 * door een echte Postgres geparsed en blijft een `uuid = text`-typefout (42883)
 * onzichtbaar — precies het gat dat 13.7 dicht.
 *
 * Deze config gebruikt GEEN setupFiles en dus GEEN Prisma-mock: de tests draaien
 * tegen een échte Postgres (met pgvector), waarvan de lifecycle door
 * `scripts/run-pg-integration-tests.sh` wordt beheerd (container + migrate deploy
 * + DATABASE_URL). Opt-in via `npm run test:integration`; de snelle gemockte
 * suite blijft onafhankelijk van een draaiende Postgres.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // GEEN setupFiles → geen Prisma-mock → echte SQL wordt door Postgres geparsed.
    include: ['src/__tests__/integration/**/*.itest.ts'],
    // Ruwe migratie/seed kan traag zijn; ruime timeout, seriële runs.
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
