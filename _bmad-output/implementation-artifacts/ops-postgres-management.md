# Postgres-beheer op ACC — zonder VPN (route + migratie-procedure)

Datum 2026-06-10. Vastgelegd na de migratie 0010 (`field_type` → GS1-codelijstnamen).

## Probleem
De ACC-Postgres draait op **cherry** (`91.99.178.223` / intern `10.0.0.6:5432`, db
`logo_recognition`). Directe SSH naar cherry is **VPN-afhankelijk en flaky** — DDL via
`ssh cherry "sudo -u postgres psql ..."` werkt alleen als de VPN net aan staat. Dat is geen
betrouwbare migratieroute.

## Oplossing (gekozen & uitgevoerd)
De app-rol **`logorecognition`** is **owner** gemaakt van alle 24 tabellen in `public`
(eenmalige `DO`-block via `sudo -u postgres` op cherry, toen de VPN aan stond). Daardoor kan
DDL voortaan via de **stabiele TCP-verbinding vanuit de app-container** (vanilla `10.0.0.5`
→ `postgres:5432` interne netwerk) — **geen cherry-SSH en geen VPN meer nodig**.

Geverifieerd: `ALTER` op een owned table + `CREATE/DROP` werken via de app-rol over TCP.

## Migratie-procedure (VPN-vrij)
1. Schrijf de migratie als idempotente raw SQL onder
   `apps/api/prisma/migrations/NNNN_naam/migration.sql` (gebruik
   `IF NOT EXISTS` / `IF EXISTS`, want `_prisma_migrations` loopt achter — Prisma-client
   wordt uit `schema.prisma` gegenereerd, niet uit de migratie-historie).
2. Pas dezelfde wijziging toe in `apps/api/prisma/schema.prisma`.
3. Voer de SQL uit **vanuit de app-container** met de app-rol over TCP, bijv. via een
   `node`-script dat `prisma.$executeRawUnsafe(...)` draait, ge-`docker cp`'d naar de
   container (vermijdt geneste SSH-quoting-problemen). Dit raakt cherry-SSH/VPN niet.
4. Commit schema + migratie + scripts samen; push naar `acc` (auto-deploy ~5–10 min,
   nieuwe Prisma-client komt mee in de image).
5. Verifieer na deploy: lees terug via de nieuwe client + check dat de review-queue
   endpoint nog serveert.

## Aandachtspunten
- **Containernamen wijzigen per deploy** → resolve de container telkens opnieuw vóór
  `docker exec`/`docker cp`.
- `_prisma_migrations` is **niet** de bron van waarheid (loopt tot 0004); de
  schema.prisma is leidend.
- Eigenaarschap is nu app-rol; vermijd alsnog destructieve DDL zonder expliciete
  toestemming (zie de DB-veiligheidsregels in de globale CLAUDE.md).
- Cherry-SSH blijft de fallback wanneer je `sudo`/`postgres`-superuser nodig hebt
  (bijv. extensies, rollen) — dat kan de app-rol niet.
