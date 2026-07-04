# Retrospective — Epic 18: Brandstofvergroting (GLN-backfill)

**Datum:** 2026-07-04 · **Branch:** `epic/vliegwiel-18` · **HEAD:** `9c1e529` (code-anchor `9379d72`) · **Base:** `f6fde84` (acc met Epics 13-17 + 12.8)
**Stories:** 18.1–18.2 (2/2 done) · **Migratie:** 0020 (`gln_backfill_reason`-kolom) · **De laatste epic van de run.**

## Wat ging goed

- **De prod-governance-gate is netjes afgehandeld als expliciet keuzemoment.** Story 18.1 begint bewust met een go/no-go: een eenmalige read-only export op de productie-tradeItems vereist Friso's akkoord. Dat is als gate voorgelegd (niet zelf beslist), akkoord gegeven, en gedocumenteerd in het story-record (2026-07-04). **Les: gates die productie of externe systemen raken horen als expliciete gebruikersbeslissing, niet als agent-aanname — precies zoals de 8 migratie-gates en deze prod-read-gate.**
- **"Bouw lokaal, echte export later" hield de run veilig.** `/implement-sprint` raakt nooit prod; 18.1/18.2 zijn volledig gebouwd + getest met gemockte MongoDB/mediaserver, en de scripts verbinden alleen achter een expliciete `--apply`/`require.main`-guard (dry-run default). De echte read-only prod-export en de gedoseerde re-import-run blijven aparte operationele stappen. De epic-review verifieerde apart dat er geen top-level prod-connectie of auto-run in de diff zit.
- **18.1↔18.2 sluiten exact op elkaar aan.** 18.1 markeert uitval met `glnBackfillReason`; 18.2 selecteert precies die records (`gln IS NULL + reden gezet`) en werkt de reden bij. Geen overlap, geen gat, geen dubbelverwerking; de dekkingsgraad-hermeting loopt via het ongewijzigde on-read 18.1-paneel.
- **Mechanisme-hergebruik zonder fork.** 18.2 hergebruikt het bestaande 8-3O-re-importmechanisme (`runImportLoop`/`markStaleRuns` geëxporteerd) met `force:false` + delta-skip en CPU-tempering (batch-size + pauze) — geen tweede import-implementatie.
- **De schoonste epic-review van de reeks** (0 critical/high/medium) — de defensieve schrijfstijl en de tussentijdse story-reviews hadden alles al gevangen.

## Wat brak / lastig was

- **Niets substantieels.** Twee low-observaties (informatief `glnCount`-veld, veilige discovery-fout-terugval) waren al in de story-reviews bewust geaccepteerd.
- **De echte waarde-oplevering ligt buiten deze run:** de daadwerkelijke GLN-dekking van het 39k-archief ontstaat pas als de prod-export + re-import operationeel gedraaid worden. Deze epic levert het gereedschap + de veiligheidsrails; de brandstof stroomt pas na die operationele stap.

## Patronen / afspraken hieruit

1. **Elk script dat een externe/prod-bron raakt: dry-run default + `--apply`/`require.main`-guard + lazy-geïmporteerde prod-dep-factories + I/O-vrije pure kern voor de tests.** Sjabloon voor toekomstige data-migratie-scripts.
2. **Governance-gates voor prod/extern zijn gebruikersbeslissingen** — voorleggen, documenteren met datum, en de story stopt zonder akkoord.
3. **Additieve kolom-migraties (één nullable kolom) zijn de veiligste vorm** en horen nog steeds door de migratie-toestemming + down-script.

## Stand van het vliegwiel na Epic 18 (einde run)

Het referentie-vliegwiel is **volledig geïmplementeerd** (Epics 13-18 + 12.8): nominatie → kwaliteitspoort → promotie/rollback/pauze, meegroeiende gold-set + outlier-audit, het volledige dashboard, de mismatch-brandstofstromen, het n8n-kruischeck-endpoint, seed-bootstrap voor lege klassen, en de GLN-backfill-gereedschappen voor het 39k-archief. De brandstof stroomt zodra de operationele stappen gedraaid worden en de nominatie-vlaggen op ACC aangezet worden.

## Operationele vervolgtaken (buiten de code, na deze run)

- **Echte read-only prod-GLN-export (18.1) + gedoseerde re-import (18.2 `--apply`)** — de daadwerkelijke brandstofinname van het 39k-archief.
- 12.8-ACC-bewijsrun (AC10), 16.3-dashboard-exportknop, AC6-afstemming reviewstation-gebruikers, opruimstory ongebruikte `bootstrapQueue`-payload.
- De nominatie-vlaggen (`FLYWHEEL_NOMINATION_ENABLED` / `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED`) staan default uit — bewust, zodat het vliegwiel pas gaat draaien na een expliciete ACC-activering met de gold-set als noodrem.
