# Bestaande code (peildatum origin/acc 9392809)

- `apps/api/src/services/pipeline/logo-scan-flow.ts` — `submitLogoScan`: leest `LOGO_MODEL_VERSION`, bouwt `tracked` (opgeslagen rij) en roept `findReusableScan` alleen aan met `productId`, zonder `rescan` en mét modelversie. Het antwoord-`modelVersion` komt los daarvan uit `process.env.LOGO_MODEL_VERSION` (`buildLogoResults`, `failedState`).
- `apps/api/src/services/pipeline/logo-scan-store.ts` — `findReusableScan(key)` filtert op `productId, imageHash, modelVersion, referenceVersion, consumer, status done, requestedAt >= nu-24u`; `insertScan` nummert `attempt` per diezelfde sleutel.
- `apps/api/prisma/schema.prisma` — `LogoScan.modelVersion` VarChar(256), uniek op `(productId, imageHash, modelVersion, referenceVersion, attempt)`.
- `apps/api/src/services/gs1-mapping.ts` — `effectiveStand`: `automatisch` alleen bij exacte match `validForModelVersion === ctx.modelVersion`. VERIFIED: 951 regels, alle `validForModelVersion: null`, 0 op `automatisch`.
- Tests: `apps/api/src/__tests__/routes/logo-scans-dedupe.test.ts` (vitest, Prisma en Redis gemockt).
- Uitrol: `docker-compose.acc.yml` (env_file `.env`, image-tag `LOGO_IMAGE_TAG`); `docs/04-deployment/ci-bouwstraat.md`: `SOURCE_COMMIT` volgt de compose-checkout, niet de image.
