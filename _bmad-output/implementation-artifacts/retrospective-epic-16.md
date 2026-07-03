# Retrospective — Epic 16: Mismatch-stromen + Story 12.8 (kruischeck-endpoint)

**Datum:** 2026-07-03 · **Branch:** `epic/vliegwiel-16` · **HEAD:** `51121f9` (review-anchor `c0333546`, code-identiek) · **Base:** `75f7bd4` (acc met Epics 13+14+15)
**Stories:** 16.1–16.4 (4/4 done) + **12.8** (kruischeck-endpoint, als prerequisite) · **Migraties:** 0018 (`mismatch_events`), 0019 (`bootstrap_queue`) · **Diff:** 64 bestanden, ~7,3k regels.

## Wat ging goed

- **Een agent-stall werd verliesloos hersteld.** De 16.1-agent liep vast midden in het typewerk (na 600s geen voortgang). Inspectie van de worktree toonde dat de migratie 0018 al klaar+toegepast was en ~70% van de code stond; een verse agent maakte het af vanaf die partiële staat (tests, review, commit). Geen enkel werk weggegooid. **Les: bij een stall eerst de worktree-staat inventariseren, dan gericht laten afmaken — niet blind herstarten.**
- **12.8 als prerequisite inschuiven werkte schoon.** 16.4 (controle-cohort, SM-3) hing af van de 12.8-verify-flow die nog niet bestond. In plaats van 16.4 te blokkeren is 12.8 (een volledig gespecificeerde ready-for-dev-story) eerst gebouwd op dezelfde branch; het leverde meteen het n8n-endpoint én deblokkeerde 16.4. De koppel-klare haakjes die 13.2 en 16.1 al hadden neergelegd sloten precies aan.
- **Meetinstrument-isolatie is expliciet geborgd.** Het grootste risico van 16.4 was een self-feeding cohort: als de maandelijkse herverwerking via de 12.8-flow zelf nominaties/mismatch-events zou triggeren, meet het instrument zichzelf. `skipFlywheelHooks` slaat dat hele blok over; een test met béíde vlaggen aan bewijst dat er niets weglekt. De epic-review verifieerde dit apart.
- **Cohort-uitsluiting consistent over 4 stories.** `origin NOT LIKE 'cohort-%'` staat in alle 6 reguliere read-sites (16.1-trend, 16.2-werkvoorraad + traceability, 16.3-rapport); de cohort-trend gebruikt de inverse. Met regressietests. Zo vervuilt het cohort de reguliere brandstofstromen niet.
- **De epic-review was schoon** (0 critical/high/medium, 1 low env-doc) — een teken dat de story-lokale reviews + mijn tussentijdse git-verificatie de meeste problemen al hadden gevangen.

## Wat brak / lastig was

- **De stall zelf** kostte een extra recovery-cyclus. Oorzaak onbekend (waarschijnlijk een lange edit-operatie op een groot bestand). Mitigatie voortaan: instrueer story-agenten om bij lange edits tussentijds te committen (heb ik vanaf 16.2 in de prompts opgenomen).
- **Env-vars niet gedocumenteerd** (L1): drie nieuwe `FLYWHEEL_`/`VERIFY_`-variabelen stonden niet in `.env.example` ondanks dat de stories het voorschrijven. Geen runtime-impact (veilige defaults), maar een afwijking van de eigen guardrail — door de epic-review gedicht.
- **Twee uitgestelde niet-blokkerende punten** (bewust): de dashboard-*exportknop* voor het datakwaliteitsrapport (16.3) wacht op een rapportpaneel op de /flywheel-pagina; 12.8-AC10 (ACC-bewijsrun) is post-deploy. Beide operationeel, geen code-schuld.

## Patronen / afspraken hieruit

1. **Bij een cross-story-afhankelijkheid op een ongebouwde story: bouw de prerequisite in dezelfde epic-branch in en review ze samen** — beter dan blokkeren of los aanmodderen. 12.8→16.4 is het model.
2. **Elke self-herverwerkende meting heeft een expliciete "geen neveneffecten"-schakelaar nodig + een test die met alle vlaggen aan bewijst dat er niets lekt.** `skipFlywheelHooks` als sjabloon.
3. **Stall-recovery = worktree-inventarisatie eerst.** Migratie al toegepast? Code hoever? Dan gericht afmaken.
4. **Story-agenten: committeer tussentijds bij lange edits** — voorkomt verlies bij een stall.

## Stand van het vliegwiel na Epic 16

De **brandstof-stromen** draaien nu: elke verwerking legt vast wat bevestigd/niet-gevonden/niet-gedeclareerd was (16.1), structurele gaten worden werkvoorraad (16.2), leverancier-omissies een exporteerbaar rapport (16.3), en een stabiel controle-cohort meet of het vliegwiel écht beter wordt (16.4, SM-3). Plus: het **n8n-kruischeck-endpoint (12.8)** staat klaar als dagelijkse voedingsbron én afnemer. Wat rest is Epic 17 (seed-bootstrap voor lege klassen — de `bootstrap_queue` staat al gevuld klaar) en Epic 18 (GLN-backfill).

## Openstaand richting latere epics (geen blocker)

- Operationeel: 16.3-dashboard-exportknop, 12.8-ACC-bewijsrun (AC10), afstemming n8n-team over de 12.8-contractuitbreiding (vlag-gedrag in de API-docs).
- Epic 17 kan de `bootstrap_queue` (16.2) direct consumeren — geen nieuwe migratie verwacht.
