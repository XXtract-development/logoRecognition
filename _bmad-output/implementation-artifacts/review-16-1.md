# Adversarial self-review — Story 16.1 (Mismatch-registratie en -aggregatie)

reviewed_commit: (pre-commit werktree op `epic/vliegwiel-16`, HEAD c05f011 + ongecommitte 16.1-wijzigingen)
verdict: PASS
scope: `apps/api` (schema + migratie + services/flywheel/mismatch-events.ts + overview/mismatch-trends.ts + overview/index.ts + pipeline/detection-flow.ts + t3777-declarations.ts) · `apps/web` (services/flywheelService.ts + components/flywheel/SignalPanels.tsx) · tests.

## Bevindingen per severity

### CRITICAL — geen

### HIGH
- **H1 — Interface-wijziging brak twee bestaande tests (regressie).** `overview/index.ts` verving `getMismatchTrendsPanel()` (lege stub, `available:false`) door de echte `getMismatchTrends()` (`available:true`), maar `flywheel-overview-panels.test.ts:209` en `flywheel-overview-compose.test.ts:38` asserten nog de oude lege-staat. **Fix:** stale asserties bijgewerkt naar de echte sub-service-vorm (available:true), intentie behouden (mismatch is geen lege-staat-stub meer). Beide suites groen. **Opgelost.**
- **H2 — Web-typecheck brak: `FlywheelPage.tsx:182`.** De service-typewijziging (`mismatchTrends: EmptyPanel` → `MismatchTrendsPanel | PanelError`) matchte niet meer met de `MismatchTrendsPanel`-component-prop (`panel: EmptyPanel`). **Fix:** component-prop verruimd naar `MismatchTrendsData | PanelError` (service-type, alias-geïmporteerd om naamcollisie met de component te vermijden); component blijft bewust de lege staat tonen (volledige weergave is 15.2-werk, AC5/UX-DR8). `tsc --noEmit` schoon. **Opgelost.**

### MEDIUM
- **M1 — Dode code na de vervanging.** `getMismatchTrendsPanel()` in `empty-panels.ts` was na de index-wijziging ongebruikt in productie (alleen nog in een test). **Fix:** functie + docblock-regel verwijderd; test-import + assertie opgeschoond. **Opgelost.**
- **M2 — Prisma-mock miste het `mismatchEvent`-model.** De gedeelde `setup.ts`-mock had geen `mismatchEvent`, waardoor persist-tests zouden falen. **Fix:** model toegevoegd (findMany/create/createMany/count). **Opgelost.**

### LOW
- **L1 — `resolveGln` mogelijk overbodig aangeroepen in een randgeval.** De guard in `detection-flow.ts` is `declared.length > 0 || reviewItems.length > 0`. Bij `declared=[]` maar `reviewItems>0` draait de GLN-lookup ook als álle reviewItems "declared-not-found" zouden zijn (geen undeclared findings). In de praktijk zijn reviewItems met `declared=[]` per crosscheck-logica altijd "gevonden maar niet verwacht" (undeclared findings), dus de lookup is dan terecht. Eén geïndexeerde query in het worker-pad (nooit HTTP), non-fataal. **Geen fix nodig** — geen correctheids- of latentie-issue op het live-pad (NFR-3 gerespecteerd).
- **L2 — `not-supported` gaat vóór `declared-not-found` (semantiek).** Geverifieerd tegen AC2/FR-14: een niet-ondersteunde klasse mag de bevestigd/niet-gevonden-ratio niet vervuilen. Volgorde in `mapMismatchEvents` klopt en is getest (`volledige typeset`-test). **Correct, geen fix.**

## Checklist (protocol §3-C)
- Alle AC geïmplementeerd → ja (zie ac-trace-16-1.md; AC1/AC4 niet-code, verantwoord).
- Architectuur-patterns gevolgd (AD-2/AD-8/AD-13; één instrumentatiepunt; VarChar-type geen enum; snake_case @@map; Timestamptz; indexen) → ja.
- Anti-patterns vermeden: crosscheck byte-gelijk (registratie hangt eráán via de bestaande uitkomst), fail-safe niet gemaskeerd (lege declaratie → geen gefabriceerde events), geen tweede vergelijking → ja.
- Graceful degradation: aggregatie best-effort (leesfout → leeg-available paneel); registratie non-fataal (try/catch, retourneert 0) → ja.
- Geen secrets/security-issues; geen debug-statements; geen dode code (M1 opgeruimd) → ja.
- Vlag-scoping: beide vlaggen default false; kruischeck eist beide vlaggen; kruischeck-uit schrijft 0 (getest) → ja.
- Cohort-uitsluiting in alle drie de aggregatiequery's (getest op de WHERE-clause) → ja.

## Fix-log
Alle HIGH/MEDIUM-bevindingen opgelost binnen deze werktree vóór commit; LOW's beoordeeld en verantwoord (geen fix nodig). Volledige suites hérdraaien na de laatste fix: apps/api 632 passed / 0 failed; apps/web 115 passed / 0 failed.
