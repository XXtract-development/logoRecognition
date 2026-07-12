---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md
  - _bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-logoRecognition-2026-07-02/EXPERIENCE.md
---

# logoRecognition — Referentie-vliegwiel zonder review - Epic Breakdown

## Overview

Dit document bevat de volledige epic- en story-breakdown voor de scope-uitbreiding "Referentie-vliegwiel zonder review", als decompositie van de PRD (prds/prd-logoRecognition-2026-07-02), de UX-spines (ux-designs/ux-logoRecognition-2026-07-02) en de architecture spine (architecture/architecture-logoRecognition-2026-07-02). Epics zijn genummerd vanaf **Epic 13** (Epics 7–11 staan in het bestaande `epics.md`; Epic 12 bestaat als story-reeks in implementation-artifacts). Stories verwijzen naar FR's (PRD), AD's (spine) en UX-DR's — ze herformuleren die bronnen niet.

## Requirements Inventory

### Functional Requirements

FR-1: Automatische nominatie — elke dubbel bevestigde detectie wordt kandidaat-referentie met evidence-contract; lege declaratie nomineert nooit; bestaande trainingsdata-registratie ongewijzigd.
FR-2: Promotiebatch als eenheid — uitsluitend complete batches die de kwaliteitspoort passeren promoveren; poort-resultaat per batch vastgelegd; quarantaine lekt niets.
FR-3: Gold-set-regressietest als poortwachter — schaduwmeting per batch; daling boven de tolerantie blokkeert (sample-gebaseerd: quarantaine bij ≥2 netto verslechterde gold-set-samples; de 1pp-drempel pas vanaf een actieve gold-set ≥200 samples); fail-closed bij niet-uitvoerbare meting.
FR-4: Rollback van gepromoveerde batches — batch-breed terugdraaien, referenties inactief, baseline hersteld, herleidbaar.
FR-5: Strenge configureerbare promotiedrempel (start 0,90) — apart van crosscheck-drempels; wijzigingen alleen door datamanager, gelogd.
FR-6: Per-klasse cap op promotie (start 10, geteld over actieve promotie-referenties; rollback en deactivatie geven ruimte terug) — nominaties boven cap geweigerd met reden; gecureerde referenties tellen niet mee en worden nooit verdrongen.
FR-7: Tweetraps-dedup — perceptual hash + embedding-gelijkenis (≥0,97), tegen actieve bibliotheek én binnen de batch.
FR-8: Outlier-audit (wekelijks) — markeert afwijkende referenties per klasse voor beoordeling; deactiveert niets automatisch; dekt ook gecureerde referenties.
FR-9: Hard-negative-geheugen — uitsluitend menselijk afgewezen kandidaten (quarantaine-afkeuring door de datamanager; reviewstation-reject wegens "geen keurmerk") permanent hard-negative met hernominatie uitgesloten (inhouds-hash); zachte poort-afwijzingen (cap-bereikt/duplicaat/outlier) worden status `rejected` mét reden, géén hard-negative, en blijven hernomineerbaar via status-reset; export voor gate-training bevat uitsluitend de menselijke categorie.
FR-10: Gold-set-aanwas uit reviewbeslissingen — accept→ECHT, reject→VALS; records immutable met vervangingsverwijzing.
FR-11: Gold-set-samenstellingsbewaking — omvang, ECHT/VALS-verdeling, klasse-spreiding; scheefgroei-signalen in dashboard; klasse-zonder-dekking gemarkeerd (niet geblokkeerd).
FR-12: Bootstrap-run per lege klasse — gids-logo als zoekzaad, uitsluitend declarerende GTINs, drempel 0,93; zaad wordt nooit referentie; lege run → terug in wachtrij.
FR-13: Bootstrap-prioritering op declaratiefrequentie — wachtrij zichtbaar/overrulebaar; geslaagde bootstrap zichtbaar als "nieuw geactiveerde klasse".
FR-14: Mismatch-registratie en -aggregatie — per verwerkte GTIN beide typen vastgelegd; per code en per GLN geaggregeerd; trend in dashboard.
FR-15: Gedeclareerd-niet-gevonden → werkvoorraad — structureel patroon (N=10/M=5) voedt bootstrap-wachtrij of aanvul-signaal; herleidbaar naar GTINs.
FR-16: Gevonden-niet-gedeclareerd → datakwaliteitsrapport — per periode, per GLN, exporteerbaar; alleen boven promotiedrempel; eigen crops, nooit gids-beelden.
FR-17: Vliegwiel-dashboard — precisietrend, promoties, quarantaines met faalreden, caps, outliers, bootstrap-wachtrij, mismatch-trends, GLN-dekkingsgraad; batch-drill-down met volledig bewijs.
FR-18: Quarantaine-afhandeling — per kandidaat afkeuren (hard-negative) of vrijgeven; vrijgave omzeilt de poort nooit (nieuwe batch).
FR-19: Pauzeknop + automatische stilstand (K=2) — nominatie/promotie stoppen, detectie loopt door; hervatten expliciet; notificatie bij automatische stilstand.
FR-20: Kruischeck-verdicts voeden nominatie — CONFIRMED boven promotiedrempel via zelfde pad als FR-1; achter configuratievlag (default uit); verdict-responses ongewijzigd.
FR-21: GLN-dekking voor het 39k-archief — backfill met doel ≥90%; restant gemarkeerd met reden; dekkingsgraad in dashboard.
FR-22: Gerichte, gebalanceerde brandstofselectie via declaraties — etiketten die gegarandeerd een gedeclareerd keurmerk bevatten worden per keurmerk gebalanceerd geselecteerd (configureerbaar N/klasse, tot de class-cap) en via het bestaande nominatiepad door de kwaliteitspoort gevoerd; de declaratie-lezer dekt alle vijf GDSN-keurmerkvelden (5/5).

### NonFunctional Requirements

NFR-1: Herleidbaarheid — elke promotie-referentie via evidence-contract terug te voeren tot bron, scores, declaratie en poort-resultaten.
NFR-2: Fail-closed — elk poortdefect blokkeert promotie; nooit "bij twijfel door".
NFR-3: Isolatie — vliegwiel-verwerking gescheiden van de live-detectiestroom; geen impact op bestaande latency.
NFR-4: Idempotentie — herverwerking/herstart leidt nooit tot dubbele nominaties of promoties.
NFR-5: Observability — poort-uitkomsten, drempelwijzigingen, pauzes en rollbacks gelogd en opvraagbaar; dashboard is de leesbare projectie.
NFR-6: Bronrestrictie gids-logo's — uitsluitend intern zoek-/vergelijkingsinstrument; nooit in exports, API-responses of rapporten.
NFR-7 (feature-NFR §4.1): Promotielus draait buiten de live-verkeersstroom en beïnvloedt bestaande verwerkings- en API-latency niet.

### Additional Requirements

- ARCH-1: Alle 16 AD's van de spine zijn bindend; stories verwijzen naar AD-nummers (m.n. AD-3 atomaire promotie, AD-14 canonieke hash, AD-15 worker-instantiëring, AD-16 status-machine).
- ARCH-2 (Constraint 1): DB-migraties alleen met expliciete toestemming per geval; per story gebundeld als Prisma-migratie die de gebruiker zelf goedkeurt/draait; nooit auto-migrate. Expliciete story-taak. Elke story-migratie levert een gedocumenteerd terugdraaipad (down-script) mee.
- ARCH-3 (Constraint 2): nieuwe ml-service-code uitsluitend onder `apps/ml-service/app/`.
- ARCH-4 (Operationele envelope): ghcr-workflow-volgorde bij deploy; migraties handmatig via `prisma migrate deploy`; eenmalige seeds (gold-set-import, GLN-export) als idempotente handmatige scripts met droge-run; job-falen-notificatie via RetrainingNotification-patroon.
- ARCH-5: Nieuwe tabellen conform Structural Seed (reference_candidates, candidate_embeddings, promotion_batches, hard_negatives, gold_set_records, threshold_changes, system_settings, mismatch_events, outlier_findings, bootstrap_queue) en conventies (snake_case @@map, VarChar-status, v1-routebestand, MLClient-only, FLYWHEEL_-env-prefix).
- ARCH-6: Nieuwe endpoints /api/v1/flywheel/* en /ml/phash, /ml/outlier-audit, /ml/regression-eval; BullMQ queue `flywheel` (concurrency 1, Job Schedulers) met jobs flywheel-promotion (nachtelijk), flywheel-bootstrap (on-demand), flywheel-outlier-audit (wekelijks).
- ARCH-7: ImageHash==4.3.2 pinnen in ml-service requirements.
- ARCH-8 (Open Question spine): governance-akkoord prod-read voor GLN-export — go/no-go-moment in de GLN-backfill-story.

### UX Design Requirements

UX-DR1: antd 5 ConfigProvider-theming met XXtract-tokens (DESIGN.md frontmatter) — gescopeerd: ConfigProvider-wrapper uitsluitend rond de /flywheel-pagina's; app-brede retheme expliciet buiten scope (aparte latere story, conform PRD §5-non-goal); Inter 14px; Material Symbols-iconen.
UX-DR2: Route `/flywheel` + navigatie-item naast Review; flat-page-conventie (FlywheelPage.tsx, FlywheelBatchDetailPage.tsx).
UX-DR3: Overzichtsscherm conform mockup mock-overzicht.html — KPI-tegelrij (precisie, nieuwe referenties, klassen, quarantaines, aan-cap, GLN-dekking), precisietrend-grafiek met tolerantielijn en batch-meetpunten, quarantainetabel met faalreden, panelen voor cap/outlier/bootstrap-wachtrij/mismatch-trends; gold-set-samenstellingspaneel (omvang, ECHT/VALS, top-5 meest/minst vertegenwoordigd, scheefgroei-signalen).
UX-DR4: Batch-detail/afhandelflow conform mock-quarantaine.html — master-detail (kandidatenlijst met statusbadges links, bewijspaneel rechts: crop naast referentie, scores, declaratieblok, poort-uitkomsten), acties Afkeuren/Vrijgeven, batchvoortgang, sneltoetsen conform reviewstation (A/R/U/pijltjes/Esc); "Batch afsluiten"-actie met samenvattingsmodal en auto-advance naar de volgende onbeoordeelde kandidaat na elke beslissing.
UX-DR5: Statussemantiek in kleur: groen=gepasseerd/gepromoveerd, amber=quarantaine/wachtend (nadrukkelijk géén fout-rood), rood uitsluitend regressie-alarm en automatische stilstand.
UX-DR6: Pauzebediening: pauzeknop met bevestigingsmodal; persistente amber pauzebanner; rode stilstand-banner bij automatische stilstand (enige rode toestand); notificatie via bestaand notificatiepatroon.
UX-DR7: Drempelbeheer-UI met verplicht redenveld; wijzigingshistorie zichtbaar (threshold_changes).
UX-DR8: State patterns: leeg/ladend/fout/gepauzeerd/stilgelegd gedefinieerd; "nieuw geactiveerde klasse"-melding (UJ-2-raakvlak); "verouderde data"-melding met handmatige verversknop en refresh-on-load (geen polling).
UX-DR9: Accessibility floor: toetsenbordnavigatie door kandidatenlijst, zichtbare focus-states, contrast conform DESIGN.md-tokens; role=alert op banners, aria-live=polite op statusmeldingen, aria-selected + scroll-into-view in de kandidatenlijst, tekstueel alternatief voor grafieken.
UX-DR10: NL-only microcopy via i18next-keys; glossary-termen exact conform PRD §3; toon nuchter ("wacht op jouw beoordeling").
UX-DR11: Historie-tab in de batch-card met gepasseerde batches en rollback-actie achter een bevestigingsmodal met verplicht redenveld; badge `teruggedraaid`; baseline-herstel zichtbaar in de precisietrend (FR-4 UI).
UX-DR12: Outlier-beoordelingsflow: doorklik opent vergelijkingsweergave (referentie naast klasse-genoten) met acties Behouden/Deactiveren (Deactiveren = active=false soft-delete, gelogd).

### FR Coverage Map

FR-1: Epic 13 — automatische nominatie (crosscheck-hook)
FR-2: Epic 13 — promotiebatch als eenheid
FR-3: Epic 13 — gold-set-regressietest als poortwachter
FR-4: Epic 13 — rollback van gepromoveerde batches (backend); Epic 15 — rollback-UI (Historie-tab)
FR-5: Epic 13 — promotiedrempel (backend/config; beheer-UI in Epic 15)
FR-6: Epic 13 — per-klasse cap
FR-7: Epic 13 — tweetraps-dedup
FR-8: Epic 14 — outlier-audit
FR-9: Epic 13 — hard-negative-geheugen
FR-10: Epic 14 — gold-set-aanwas uit reviewbeslissingen
FR-11: Epic 14 — gold-set-samenstellingsbewaking
FR-12: Epic 17 — bootstrap-run per lege klasse
FR-13: Epic 17 — bootstrap-prioritering en wachtrij
FR-14: Epic 16 — mismatch-registratie en -aggregatie
FR-15: Epic 16 — gedeclareerd-niet-gevonden → werkvoorraad
FR-16: Epic 16 — gevonden-niet-gedeclareerd → datakwaliteitsrapport
FR-17: Epic 15 — vliegwiel-dashboard
FR-18: Epic 15 — quarantaine-afhandeling
FR-19: Epic 13 (automatische stilstand + persistente pauze, backend) / Epic 15 (pauzebediening + banners, UI)
FR-20: Epic 13 — kruischeck-voeding achter vlag
FR-21: Epic 18 — GLN-dekking historisch archief
FR-22: Epic 19 — gerichte brandstofselectie via declaraties (5/5-velddekking raakt tevens FR-1/12/15/20)

## Epic List

### Epic 13: Zelfvullende referentiebibliotheek (promotielus met kwaliteitspoort)
Dubbel bevestigde detecties worden zonder menselijke review veilige referenties: nominatie → batch → kwaliteitspoort (guardrails + gold-set-regressietest) → atomaire promotie, met quarantaine, rollback en hard-negative-geheugen. Na deze epic groeit de referentiebibliotheek automatisch en aantoonbaar veilig — ook zonder dashboard (notificaties via bestaand patroon; quarantaines blijven veilig staan tot Epic 15 de afhandel-UI levert).
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-9, FR-19 (backend), FR-20

### Epic 14: Meegroeiend meetinstrument & referentie-audits
De gold-set groeit vanzelf mee met elke reviewbeslissing en bewaakt zijn eigen samenstelling; de wekelijkse outlier-audit vangt afwijkende referenties (ook gecureerde) vóór ze schade doen. Na deze epic wordt de noodrem van het vliegwiel elke week sterker. De redenkeuze bij reviewstation-rejects (Story 14.1) is — naast de gescopeerde theming in Epic 15 — de tweede bewuste uitzondering op het PRD §5-non-goal "geen wijziging van het reviewstation-proces": een minimale UI-uitbreiding, alleen zichtbaar bij vliegwiel-vlag aan.
**FRs covered:** FR-8, FR-10, FR-11

### Epic 15: Vliegwiel-dashboard & besturing
De datamanager bestuurt het vliegwiel vanuit één scherm: gezondheid in één oogopslag, quarantaine-afhandeling met volledig bewijs, drempelbeheer met verplichte reden, pauze en stilstand-banners. Na deze epic verschuift de rol van reviewer naar bestuurder (UJ-1, UJ-3). De theming is een bewuste, gescopeerde uitzondering: uitsluitend rond de /flywheel-pagina's — een app-brede retheme is expliciet buiten scope (aparte latere story, conform PRD §5-non-goal).
**FRs covered:** FR-17, FR-18, FR-19 (UI), FR-5 (beheer-UI), FR-4 (UI)

### Epic 16: Mismatch-stromen als brandstof en datakwaliteitssignaal
Structurele verschillen tussen declaratie en detectie — in de PRD-glossary de **mismatch-trigger**, de overkoepelende term voor beide typen — worden vastgelegd en vertaald: gedeclareerd-niet-gevonden wordt gerichte werkvoorraad, gevonden-niet-gedeclareerd wordt een exporteerbaar datakwaliteitsrapport per leverancier. Na deze epic verspilt het systeem geen enkel leermoment meer.
**FRs covered:** FR-14, FR-15, FR-16

### Epic 17: Seed-bootstrap voor lege klassen
Keurmerkklassen zonder referenties vullen zichzelf: het gids-logo als zoekzaad binnen declarerende producten, vondsten door de normale kwaliteitspoort, prioritering op declaratiefrequentie (UJ-2). Na deze epic raken de ~15 lege klassen en de staart daarachter vanzelf gevuld.
**FRs covered:** FR-12, FR-13

### Epic 18: Brandstofvergroting — GLN-dekking voor het 39k-archief
Het historische archief (39k producten) krijgt GLN-dekking zodat declaratie-lookup en dubbele bevestiging mogelijk worden; de dekkingsgraad is zichtbaar in het dashboard. Na deze epic is de brandstoftank van het vliegwiel ontsloten (de bulk-run zelf is operationeel vervolgwerk, buiten scope).
**FRs covered:** FR-21

### Epic 19: Gerichte brandstofselectie via declaraties
Het vliegwiel wordt gericht gevoed: via de GS1-declaraties selecteren we etiketten die gegarandeerd een keurmerk bevatten, gebalanceerd per keurmerk (tot de class-cap), in plaats van blind het hele archief te verwerken. Een spike ontsluit eerst de ACC-verwerkingstoegang (media-index + catalog-baseline; bestanden staan al gesynct) en meet de werkelijke dekking; daarna parser-uitbreiding naar 5/5 velden, de keurmerk→etiket-index, en de gebalanceerde sampler. Na deze epic wordt de brandstoftank (Epic 18) gericht én gebalanceerd benut.
**FRs covered:** FR-22 (+ 5/5-dekking raakt FR-1/12/15/20)

**Volgorde en afhankelijkheden:** 13 → 14 → 15 → 16 → 17 → 18 → 19. Epic 13 is standalone; 14 bouwt op de gold-set-opslag uit 13; 15 leest de state uit 13/14; 16 haakt op dezelfde paden als 13 maar staat functioneel los; 17 vereist de poort uit 13; 18 is onafhankelijk van 14–17 en kan desgewenst parallel; 19 bouwt op de poort (13), het bootstrap-/nominatiepad (17) en de brandstoftoegang (18), en start met een spike die de ACC-verwerkingstoegang ontsluit.

**Coördinatie-noot (overview-endpoint en crosscheck-hook):** het endpoint `/api/v1/flywheel/overview` wordt modulair opgebouwd — per dashboard-paneel een eigen sub-service — omdat vijf epics (13 t/m 17) er panelen aan leveren; zo blijft elke epic zelfstandig integreerbaar zonder merge-conflicten op één monoliet-handler. Story 16.1 hergebruikt exact de 13.2-hook-plek in `apps/api/src/services/artwork-crosscheck.ts` (één instrumentatiepunt, twee afnemers).

## Epic 13: Zelfvullende referentiebibliotheek (promotielus met kwaliteitspoort)

Dubbel bevestigde detecties worden zonder menselijke review veilige referenties: nominatie → batch → kwaliteitspoort → atomaire promotie, met quarantaine, rollback en hard-negative-geheugen. (FR-1 t/m FR-7, FR-9, FR-19 backend, FR-20 · AD-1 t/m AD-6, AD-8, AD-9, AD-11 t/m AD-16)

### Story 13.1: Canonieke inhouds-hash-service

As a datamanager,
I want dat elke crop één en dezelfde, reproduceerbare inhouds-hash krijgt,
So that ontdubbeling, idempotentie en het hard-negative-geheugen nooit stil kunnen falen door twee verschillende hash-definities.

**Acceptance Criteria:**

**Given** een crop-afbeelding in MinIO
**When** de API via de MLClient het nieuwe ml-service-endpoint `/ml/phash` aanroept
**Then** retourneert ml-service de canonieke inhouds-hash (SHA-256 over de pixel-buffer na gepinde normalisatie) én de perceptual hash (pHash) in één response (AD-14)
**And** levert dezelfde crop bij herhaalde aanroep byte-identiek dezelfde hashes op.

**Given** de ml-service-requirements
**When** de dependency wordt toegevoegd
**Then** is `ImageHash==4.3.2` gepind en staat alle nieuwe code onder `apps/ml-service/app/` (services/phash.py, api/flywheel.py met prefix `/ml`) (ARCH-3, ARCH-7).

**Given** de API-codebase
**When** gezocht wordt naar hash-berekeningen voor crops
**Then** bestaat er geen inhouds-hash-implementatie in Node; de MLClient-methode is de enige route (AD-14).

*Bronnen: AD-14, AD-9, ARCH-3, ARCH-7; PRD FR-9-assumptie.*

### Story 13.2: Automatische nominatie bij dubbele bevestiging

As a datamanager,
I want dat elke dubbel bevestigde detectie automatisch kandidaat-referentie wordt (uit import/detectie, achter een aparte vlag uit kruischeck-verdicts, én — bij hoofdvlag-aan — uit reviewstation-accepts als absorptie van het 12.3-pad),
So that geen enkel dubbel bewijs meer verdampt in alleen trainingsdata.

**Acceptance Criteria:**

**Given** de nieuwe Prisma-migratie voor `reference_candidates`, `candidate_embeddings` en `hard_negatives` (conform Structural Seed, incl. `@@unique([contentHash, t3777Code])`, en met `promotionBatchId` als nullable kolom ZONDER FK-constraint — de FK-constraint volgt in de 13.4-migratie)
**When** de migratie wordt voorbereid
**Then** wordt deze als expliciete taak ter goedkeuring aan de gebruiker voorgelegd, nooit automatisch uitgevoerd, en met een gedocumenteerd terugdraaipad (down-script) (ARCH-2).

**Given** een detectie met dubbele bevestiging waarvan de confidence ≥ de promotiedrempel van de gebruikte methode (per methode configureerbaar: `FLYWHEEL_PROMOTION_THRESHOLD_<METHODE>` voor template/embedding/classifier, alle default 0,90) (FR-5)
**When** de crosscheck-flow deze verwerkt met `FLYWHEEL_NOMINATION_ENABLED=true`
**Then** ontstaat exact één `reference_candidates`-rij (status `candidate`, herkomst `crosscheck`, evidence-contract gevuld, embedding in `candidate_embeddings`) met de synchroon via `/ml/phash` opgehaalde inhouds-hash (FR-1, AD-8, AD-14)
**And** blijft de bestaande trainingsdata-registratie (Story 8.6) byte-voor-byte ongewijzigd (FR-1)
**And** wordt bij onbereikbare hash-service de nominatie geweigerd (fail-closed, AD-14).

**Given** de nominatie-verwerking (inclusief de synchrone `/ml/phash`-aanroep)
**When** een nominatie ontstaat
**Then** draait die volledig in het bestaande pipeline-worker-pad (BullMQ), nooit in het live-API-request-pad (NFR-3, NFR-7).

**Given** een CONFIRMED-kruischeck-verdict (12.8) boven de promotiedrempel
**When** `FLYWHEEL_NOMINATION_ENABLED=true` én `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED=true`
**Then** ontstaat via hetzelfde pad een kandidaat met herkomst `kruischeck`, terwijl de verdict-response richting n8n op geen enkele wijze verandert (FR-20, AD-8).

**Given** een verse deploy zonder env-overrides
**When** een CONFIRMED-verdict binnenkomt
**Then** ontstaat er géén kandidaat — `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` staat default op `false` en gaat pas aan ná bewezen promotielus op de importstroom (FR-20, AD-8).

**Given** een reviewstation-accept met `FLYWHEEL_NOMINATION_ENABLED=true`
**When** de accept wordt verwerkt
**Then** nomineert het accept-pad een kandidaat met herkomst `review` en is de directe 12.3-registratie (`similarity.py::register_crop_as_reference` → rechtstreeks `reference_logos`/`reference_embeddings`) uitgeschakeld — ml-service schrijft dan geen referentie-tabellen meer (AD-1, AD-2)
**And** blijft met de vlag uit het legacy-12.3-gedrag ongewijzigd (geleidelijke migratie)
**And** is de herkomst-enum overal `crosscheck`/`kruischeck`/`bootstrap`/`review`.

**Given** een nominatie die geweigerd of overgeslagen wordt (reden: `phash-onbereikbaar`, `pauze` of `vlag-uit`)
**When** de weigering optreedt
**Then** wordt dit als event geregistreerd mét reden en is het als teller "gemiste nominaties" opvraagbaar via de overview-API (dashboard-weergave in Story 15.2) — geen stille brandstofverliezen (NFR-5).

**Given** een detectie zonder declaratie-bevestiging, onder de drempel, met een inhouds-hash die al in `hard_negatives` of `reference_candidates` staat, óf met de vlag uit
**When** de flow deze verwerkt
**Then** ontstaat er géén nieuwe kandidaat-rij (FR-1-veiligheidsregel, FR-9-hernominatie-blokkade voor hard-negatives, AD-12); een bestaande zacht afgewezen rij (`rejected` met reden cap/duplicaat/outlier) mag wél via status-reset opnieuw `candidate` worden — geen nieuwe insert, de `@@unique` blijft kloppen (AD-12)
**And** levert herverwerking van dezelfde GTIN nooit duplicaat-nominaties op (NFR-4).

*Bronnen: FR-1, FR-5, FR-9 (blokkade), FR-20; AD-1, AD-2, AD-8, AD-12, AD-14, AD-16; NFR-3, NFR-5, NFR-7; ARCH-2.*

### Story 13.3: Gold-set naar beheerde opslag met seed-import

As a datamanager,
I want de goudstandaard in een beheerde gegevensopslag met een eenduidige actieve-set-definitie,
So that de regressietest een reproduceerbaar en groeibaar meetinstrument heeft.

**Acceptance Criteria:**

**Given** de nieuwe Prisma-migratie voor `gold_set_records` (immutable, `replacedById` self-FK)
**When** de migratie wordt voorbereid
**Then** wordt deze ter expliciete goedkeuring voorgelegd (ARCH-2).

**Given** de bestaande bestanden `tests/validation/gold-set-oogstrun.json` (91 samples) en `declared-marks-goldset.json` (74 GTINs)
**When** het idempotente seed-importscript draait (met `--dry-run`-optie die niets schrijft maar het importplan toont)
**Then** staan alle records in `gold_set_records` met label, code, crop-verwijzing en herkomst; een tweede run voegt niets toe (ARCH-4)
**And** zijn de repo-bestanden gemarkeerd als read-only legacy met verwijzing naar de tabel (AD-4).

**Given** een gold-set-record dat vervangen wordt
**When** de vervanging plaatsvindt
**Then** blijft het oude record bestaan met `replacedById` gezet (enige toegestane mutatie) en bestaat de actieve set uitsluitend uit records met `replacedById IS NULL`, geresolved in `apps/api` (AD-4, FR-10-immutabiliteit).

*Bronnen: FR-3 (fundament), FR-10 (datamodel); AD-4; ARCH-2, ARCH-4.*

### Story 13.4: Nachtelijke promotielus — batching en guardrails

As a datamanager,
I want dat kandidaten nachtelijk gebundeld worden en eerst langs caps en ontdubbeling gaan,
So that alleen zinvolle, niet-dubbele kandidaten de dure regressietest bereiken.

**Acceptance Criteria:**

**Given** de nieuwe Prisma-migratie voor `promotion_batches`, inclusief het alsnog toevoegen van de FK-constraint op `reference_candidates.promotionBatchId` (in 13.2 bewust als nullable kolom zonder constraint aangemaakt)
**When** de migratie wordt voorbereid
**Then** wordt deze ter expliciete goedkeuring voorgelegd, met gedocumenteerd terugdraaipad (down-script) (ARCH-2).

**Given** openstaande kandidaten (status `candidate`)
**When** de repeatable job `flywheel-promotion` draait (nieuwe BullMQ-queue `flywheel`, worker-concurrency 1, aangemaakt via `queue.upsertJobScheduler` — Job Schedulers, niet het gedeprecieerde repeat-patroon; cadans `FLYWHEEL_PROMOTION_CRON`, default 01:00 Europe/Amsterdam — bewust vóór/buiten het bestaande harvest-venster ~03:23 om ml-service-CPU-concurrentie te vermijden, AD-6)
**Then** bundelt uitsluitend deze worker ze in een `promotion_batches`-rij en zet elke kandidaat via conditional update op `in_batch` met `promotionBatchId` (claim: hoogstens één niet-afgesloten batch per kandidaat) (FR-2, AD-6, AD-15, AD-16).

**Given** een klasse waarvan het aantal actieve promotie-referenties de cap (`FLYWHEEL_CLASS_CAP`, default 10, geteld over actieve promotie-referenties — rollback en deactivatie geven ruimte terug) zou overschrijden
**When** de guardrail-fase draait
**Then** worden kandidaten boven de cap afgewezen met reden `cap-bereikt`; handmatig gecureerde referenties tellen niet mee en worden nooit verdrongen (FR-6)
**And** wordt de cap bovendien ín de promotie-transactie afgedwongen (AD-6).

**Given** twee bijna-identieke kandidaten in één batch, of een kandidaat die visueel vrijwel samenvalt met een actieve referentie van dezelfde klasse
**When** de tweetraps-dedup draait (pHash-Hamming via `/ml/phash`-output; embedding-cosine ≥ 0,97 via pgvector)
**Then** overleeft hoogstens één; de rest wordt afgewezen met reden `duplicaat` (FR-7, AD-9)
**And** checkt dedup trap 2 óók tegen ináctieve referenties van dezelfde klasse met herkomst `flywheel-promotion` of `review`, zodat een kloon van een zojuist gedeactiveerde slechte referentie niet opnieuw gepromoveerd wordt (kloon-gat; FR-6/FR-7).

**Given** elke door de guardrails zacht afgewezen kandidaat (reden `cap-bereikt`, `duplicaat` of `outlier`)
**When** de afwijzing wordt vastgelegd
**Then** krijgt de kandidaat status `rejected` mét reden (conditional update) en ontstaat er GÉÉN `hard_negatives`-rij — hard-negatives ontstaan uitsluitend bij menselijke afkeuring: quarantaine-afkeuring (15.3) en reviewstation-reject wegens "geen keurmerk" (14.1) (FR-9, AD-12, AD-16)
**And** is hernominatie toegestaan via status-reset van de bestaande rij naar `candidate` — geen nieuwe insert, de `@@unique([contentHash, t3777Code])` blijft kloppen (AD-12, AD-16).

**Given** de kandidaten van een batch en het klasse-centroid van hun klasse
**When** de per-batch outlier-guardrail via `/ml/outlier-audit` de afstand van elke kandidaat tot het klasse-centroid bepaalt
**Then** worden kandidaten boven de grens afgewezen met reden `outlier` (zachte afwijzing — géén hard-negative, AD-12) — daarmee zijn de PRD-glossary "guardrail-checks (caps, dedup, outlier)" en de G1-node in de spine-flowchart waar (FR-2, FR-9, AD-9).

**Given** een batch die de guardrail-fasen doorloopt
**When** elke poort-fase (drempel/cap/dedup/outlier/regressie) afrondt
**Then** bewaart de batch per fase een uitkomst-record in `gateResults`, opvraagbaar voor de dashboard-stories 15.2/15.3 (FR-2, AD-13).

**Given** een worker-herstart terwijl een batch met status `pending` openstaat
**When** de job `flywheel-promotion` opnieuw start
**Then** pakt hij éérst de bestaande `pending`-batch(es) op en hervat de poort idempotent per fase (via `gateResults`), pas daarna bundelt hij nieuwe kandidaten — de hangende batch wordt altijd afgerond en kandidaten raken nooit permanent vast in `in_batch` (AD-12, AD-16, NFR-4).

**Given** de nachtelijke run
**When** de job succesvol afrondt, faalt of uitblijft
**Then** legt elke succesvolle run zijn tijdstempel vast ("laatste succesvolle run", opvraagbaar via de overview-API) en produceert een lichte repeatable check een notificatie via het bestaande RetrainingNotification-patroon zodra die laatste succesvolle run >26 uur oud is (watchdog; operationele envelope §4, ARCH-4).

*Bronnen: FR-2, FR-6, FR-7, FR-9; AD-6, AD-9, AD-12, AD-13, AD-15, AD-16; NFR-4; ARCH-2, ARCH-4, ARCH-6.*

### Story 13.5: Kwaliteitspoort — regressietest, promotie en quarantaine

As a datamanager,
I want dat elke batch langs een gold-set-regressietest gaat vóór promotie,
So that een besmette batch de herkenning nooit kan verslechteren.

**Acceptance Criteria:**

**Given** een batch die de guardrails passeerde
**When** ml-service `/ml/regression-eval` de meting draait (actieve `ReferenceEmbedding` UNION schaduwset = uitsluitend `in_batch`-kandidaten van deze batch; gold-set als payload meegegeven door de API)
**Then** wordt precisie@drempel over de volledige actieve gold-set gemeten zonder enige mutatie van de actieve referentieset (FR-3, AD-4, AD-5)
**And** sluit de eval per query-crop referenties én schaduw-kandidaten met dezélfde inhouds-hash uit (self-match-guard, leave-one-out), zodat een gold-set-crop die (later) referentie wordt nooit tegen zichzelf matcht (AD-5).

**Given** een systeem waarin nog geen enkele batch de poort passeerde
**When** de allereerste batch zich aandient
**Then** draait vóóraf een eenmalige nulmeting (pre-vliegwiel-precisie over de actieve referentieset, zonder schaduwset) die als initiële baseline wordt vastgelegd, zodat SM-1 een vergelijkingsanker heeft (FR-3, AD-5, SM-1).

**Given** een baseline die als verouderd is gemarkeerd (mutatie van de actieve referentieset buiten batch-promotie om — zie Story 13.6)
**When** de eerstvolgende poortrun start
**Then** begint die met een verse nulmeting op de actuele actieve set vóór hij batches meet (baseline-invalidatie, AD-5).

**Given** kandidaten waarvan de embedding-modelversie ≠ de actieve modelversie
**When** de poort de batch meet
**Then** worden die kandidaten niet gemeten: ze gaan via conditional update terug naar status `candidate` met een her-embed-taak, en modelactivatie (Epic 9-mechanisme) invalideert openstaande `candidate_embeddings` (versie-guard, AD-5, AD-16).

**Given** een meting binnen de tolerantie t.o.v. de baseline van de meest recente `passed`-batch (sample-gebaseerd zolang de gold-set klein is: quarantaine bij ≥2 netto verslechterde gold-set-samples; de 1pp-drempel geldt pas vanaf een actieve gold-set ≥200 samples)
**When** de batch promoveert
**Then** gebeurt dat per kandidaat als één atomaire transactie: INSERT `ReferenceLogo` (`active=true`, `source='flywheel-promotion'`, variantLabel `auto-{batchShortId}-{seq}`) + kopie van de embedding naar `ReferenceEmbedding` (géén herberekening) + kandidaat-status → `promoted` (AD-3)
**And** wordt de nieuwe baseline-meting op de batch vastgelegd en zijn alle metingen historisch opvraagbaar (FR-3, AD-5).

**Given** een meting boven de tolerantie
**When** de poort beslist
**Then** krijgt de batch status `quarantined` met de gemeten delta en meest getroffen klassen; niets van de batch wordt actief (FR-2, FR-3)
**And** ontstaat een notificatie via het bestaande RetrainingNotification-patroon (AD-11, ARCH-4).

**Given** een niet-uitvoerbare meting (gold-set onbereikbaar, ml-service down)
**When** de poort draait
**Then** wordt de batch fail-closed gequarantaineerd met reden `systeem-fout` (NFR-2, AD-11).

*Bronnen: FR-2, FR-3; AD-3, AD-4, AD-5, AD-11, AD-16 (versie-guard-overgang); NFR-1, NFR-2; SM-1 (nulmeting).*

### Story 13.6: Rollback, persistente pauze en automatische stilstand

As a datamanager,
I want een gepromoveerde batch als geheel kunnen terugdraaien en de zekerheid dat het vliegwiel zichzelf stillegt bij herhaald falen,
So that geen enkele fout onomkeerbaar of onopgemerkt is.

**Acceptance Criteria:**

**Given** de nieuwe Prisma-migratie voor `system_settings` (key/value, persistente pauze)
**When** de migratie wordt voorbereid
**Then** wordt deze ter expliciete goedkeuring voorgelegd (ARCH-2).

**Given** een gepromoveerde batch
**When** de datamanager rollback uitvoert (service + endpoint `batches/:id/rollback` — een toegestane, gelogde statusmutatie conform de AD-15-verduidelijking, géén poort-executie; UI volgt in Epic 15)
**Then** worden alle referenties van de batch `active=false` (soft-delete; nooit DELETE), matcht geen detectie er meer tegen, krijgt de batch status `rolled_back`, en valt de vergelijkings-baseline automatisch terug op de laatst overgebleven `passed`-batch (FR-4, AD-3, AD-5)
**And** is de rollback herleidbaar in het evidence-contract (wie, wanneer, waarom) (NFR-1, AD-13).

**Given** élke mutatie van de actieve referentieset buiten batch-promotie om (handmatige curatie/upload, outlier-deactivatie, rollback — óók van een niet-recente batch — of legacy-12.3-registratie zolang de hoofdvlag uit staat)
**When** de mutatie plaatsvindt
**Then** wordt de baseline als verouderd gemarkeerd, zodat de eerstvolgende poortrun met een verse nulmeting op de actuele actieve set begint (Story 13.5; AD-5).

**Given** K=2 opeenvolgende gequarantaineerde batches
**When** de tweede quarantaine valt
**Then** pauzeert het systeem zichzelf (persistent in `system_settings`; een herstart heft de pauze niet op) en ontstaat een notificatie met de aanleiding (FR-19, AD-11).

**Given** de pauzestand actief
**When** nominatie-hooks of de jobs `flywheel-promotion`/`flywheel-bootstrap` draaien
**Then** ontstaan er geen nieuwe kandidaten en promoveert niets, terwijl live-detectie, trainingsdata-registratie, outlier-audit (read-only) en dashboard-reads gewoon doorlopen; hervatten vereist een expliciete actie (FR-19, AD-11).
*(Noot: de onderdelen outlier-audit en `flywheel-bootstrap` van deze AC zijn pas volledig testbaar zodra Story 14.3 resp. 17.1 bestaan — bewuste vooruitverwijzing.)*

**Given** de verzameling hard-negatives
**When** de datamanager exporteert
**Then** is de set exporteerbaar als trainingsmateriaal voor de gate en filtert de export uitsluitend op de menselijk afgewezen categorie (quarantaine-afkeuring, reviewstation-reject wegens "geen keurmerk") — zacht afgewezen kandidaten (cap/duplicaat/outlier) zitten er per definitie niet in, want die krijgen geen hard-negative-rij (FR-9, AD-12).

*Bronnen: FR-4, FR-9 (export), FR-19 (backend); AD-3, AD-5, AD-11, AD-13; ARCH-2, ARCH-4.*

## Epic 14: Meegroeiend meetinstrument & referentie-audits

De gold-set groeit mee met elke reviewbeslissing en bewaakt zijn samenstelling; de wekelijkse outlier-audit vangt afwijkende referenties. (FR-8, FR-10, FR-11 · AD-4, AD-6, AD-9, AD-13)

### Story 14.1: Gold-set-aanwas uit reviewbeslissingen

As a datamanager,
I want dat elke reviewbeslissing die ik neem automatisch de goudstandaard voedt,
So that de noodrem van het vliegwiel meegroeit zonder extra werk.

**Acceptance Criteria:**

**Given** een expliciete accept-beslissing, of een reject-beslissing met reden "geen keurmerk", in het reviewstation
**When** de beslissing wordt opgeslagen
**Then** ontstaat exact één `gold_set_records`-record (accept→ECHT, reject-wegens-geen-keurmerk→VALS) met crop-verwijzing, T3777-code, bron en beslisser (FR-10)
**And** blijft de bestaande reviewstation-flow verder ongewijzigd — de redenkeuze bij reject is de enige, minimale UI-uitbreiding en is alleen zichtbaar bij vliegwiel-vlag aan (PRD §5-nuance).

**Given** een reject-beslissing in het reviewstation met de vliegwiel-vlag aan
**When** de datamanager afwijst
**Then** onderscheidt de reject-flow twee redenen: **"geen keurmerk"** → gold-set-record VALS én de inhouds-hash van de crop naar `hard_negatives` (opgehaald via de canonieke `/ml/phash`-route, AD-14), zodat de 13.2-hernominatie-blokkade hem permanent vangt (FR-9, FR-10); **"onjuiste locatie/verkeerde code"** → géén gold-set-record en géén hard-negative — de beeldinhoud is niet fout, alleen de toewijzing (FR-9, FR-10, AD-12).

**Given** een zojuist genomen reviewbeslissing die ongedaan wordt gemaakt (undo)
**When** de undo wordt verwerkt
**Then** wordt het zojuist aangemaakte gold-set-record vervangen via `replacedById` (beide bewaard, FR-10, AD-4) en wordt de bijbehorende `hard_negatives`-rij verwijderd (FR-9).

**Given** een bestaand gold-set-record
**When** een correctie nodig is
**Then** gebeurt die via een nieuw record dat het oude vervangt (`replacedById`), met beide bewaard (FR-10, AD-4).

**Given** quarantaine-beoordelingen (Epic 15)
**When** die later beschikbaar komen
**Then** gebruikt deze story een herbruikbare service-functie zodat die paden dezelfde aanwas-route kunnen aanroepen (geen duplicaatlogica). De gold-set groeit uitsluitend uit menselijke beslissingen; zachte poort-afwijzingen horen in geen van beide registers (AD-12).

**Story-taak:** korte afstemming met de reviewstation-gebruikers over de nieuwe bijbestemmingen van hun klik (gold-set-aanwas, hard-negative bij "geen keurmerk", redenkeuze bij reject, undo-gedrag).

*Bronnen: FR-10, FR-9 (reviewstation-bron); AD-4, AD-12, AD-13, AD-14; PRD §5-nuance.*

### Story 14.2: Gold-set-samenstellingsbewaking

As a datamanager,
I want zicht op de omvang en scheefgroei van de goudstandaard,
So that ik weet of de regressietest nog op een gezond meetinstrument draait.

**Acceptance Criteria:**

**Given** de actuele gold-set
**When** de samenstellingsdata wordt opgevraagd (API voor het dashboard)
**Then** zijn omvang, ECHT/VALS-verdeling en de top-5 meest/minst vertegenwoordigde klassen beschikbaar (FR-11).

**Given** een klasse die >20% van de set uitmaakt of een ECHT-aandeel buiten 60–90%
**When** de bewaking draait
**Then** wordt het scheefgroei-signaal geregistreerd en via de overview-API ontsloten (FR-11).

**Given** promotie van een klasse zonder enige gold-set-dekking
**When** de poort die batch verwerkt
**Then** wordt dit gemarkeerd (niet geblokkeerd) in de batch-poort-uitkomsten (FR-11).

**Given** het bewakingsmechanisme
**When** de overview-aanroep binnenkomt
**Then** wordt de samenstellingsbewaking on-read berekend bij die aanroep — er is geen aparte job (raakt AD-6 dus niet) (FR-11).

*Bronnen: FR-11; AD-13.*

### Story 14.3: Wekelijkse outlier-audit op de referentiebibliotheek

As a datamanager,
I want dat afwijkende referenties (ook handmatig gecureerde) wekelijks gesignaleerd worden,
So that een RECYCLABLE-achtig incident voortaan vooraf gevangen wordt.

**Acceptance Criteria:**

**Given** de nieuwe Prisma-migratie voor `outlier_findings` (conform Structural Seed)
**When** de migratie wordt voorbereid
**Then** wordt deze ter expliciete goedkeuring voorgelegd (ARCH-2).

**Given** alle actieve referenties van een klasse
**When** de repeatable job `flywheel-outlier-audit` (wekelijks, queue `flywheel`) via `/ml/outlier-audit` centroid-afstanden berekent
**Then** worden referenties in het bovenste 5%-percentiel of boven de absolute grens gemarkeerd als outlier-melding met vergelijkingsdata (FR-8, AD-9)
**And** dekt de audit óók handmatig gecureerde referenties (FR-8)
**And** deactiveert de audit zelf niets (FR-8).

**Given** een afgeronde audit-run
**When** het resultaat wordt vastgelegd
**Then** is het persistent in `outlier_findings` (status `open`) en opvraagbaar via de overview-API (herstart-bestendig), inclusief run-tijdstempel (NFR-5).

**Given** een openstaande outlier-melding
**When** de datamanager wil beoordelen
**Then** verlopen de beoordelingsacties (Behouden/Deactiveren) via de dashboard-flow van Story 15.2 (endpoint `outliers/:id/decision`) — deze story levert uitsluitend signalering en persistentie.

**Given** de pauzestand actief
**When** de audit draait
**Then** draait die gewoon door (read-only; AD-11 pauze-scope).

*Bronnen: FR-8; AD-6, AD-9, AD-11; NFR-5; ARCH-2.*

## Epic 15: Vliegwiel-dashboard & besturing

De datamanager bestuurt het vliegwiel vanuit één scherm. (FR-17, FR-18, FR-19-UI, FR-5-UI, FR-4-UI · AD-10, AD-11, AD-15, AD-16 · UX-DR1 t/m UX-DR12)

### Story 15.1: Vliegwiel-sectie in de app — theming, route en navigatie

As a datamanager,
I want een Vliegwiel-onderdeel in de bestaande applicatie in de XXtract-huisstijl,
So that ik het vliegwiel vind waar ik al werk.

**Acceptance Criteria:**

**Given** de bestaande SPA
**When** de theming-setup landt
**Then** is antd 5 via een ConfigProvider-wrapper uitsluitend rond de /flywheel-pagina's gethemed met de XXtract-tokens uit DESIGN.md (navy primair, teal links, groen succes, statuskleuren conform de UX-DR5-semantiek, Inter 14px) zonder visuele regressie op bestaande schermen (UX-DR1, UX-DR5, AD-10)
**And** is een app-brede retheme expliciet buiten scope — die volgt als aparte latere story (UX-DR1, PRD §5-non-goal).

**Given** de navigatie
**When** de gebruiker het nieuwe item "Vliegwiel" (icoon `autorenew`, met badge die het aantal openstaande quarantainebatches toont) naast Review kiest
**Then** landt hij op route `/flywheel` (FlywheelPage.tsx, flat-page-conventie) met een correcte lege/ladende staat zolang er geen data is (UX-DR2, UX-DR8)
**And** zijn alle teksten NL via i18next-keys met glossary-termen exact conform PRD §3 (UX-DR10).

*Bronnen: UX-DR1, UX-DR2, UX-DR8, UX-DR10; AD-10.*

### Story 15.2: Overzichtsscherm — de gezondheid van het vliegwiel in één oogopslag

As a datamanager,
I want één overzicht van precisietrend, promoties, quarantaines, caps, outliers, wachtrijen en dekkingsgraad,
So that ik maandagochtend in tien minuten weet of het vliegwiel gezond draait (UJ-1).

**Acceptance Criteria:**

**Given** het endpoint `/api/v1/flywheel/overview`
**When** FlywheelPage laadt
**Then** toont het scherm conform mock-overzicht.html: KPI-tegelrij, gold-set-precisietrend met tolerantielijn en één meetpunt per gepasseerde batch (regressies visueel herkenbaar), quarantainetabel met faalreden, en panelen voor klassen-aan-cap, outlier-meldingen, bootstrap-wachtrij, mismatch-trends en GLN-dekkingsgraad (FR-17, UX-DR3) — panelen waarvan de bron-epic nog niet gebouwd is tonen hun lege staat (UX-DR8).

**Given** de statussemantiek
**When** statussen worden getoond
**Then** is groen=gepasseerd/gepromoveerd, amber=quarantaine/wachtend, rood uitsluitend regressie-alarm en automatische stilstand (UX-DR5).

**Given** een batch in de quarantainetabel
**When** de datamanager erop klikt
**Then** opent de batch-detailpagina (Story 15.3-route; tot die er is: detail-drawer met poort-uitkomsten uit de overview-data) (FR-17).

**Given** de gold-set-samenstellingsdata (Story 14.2)
**When** het overzicht laadt
**Then** toont een gold-set-samenstellingspaneel omvang, ECHT/VALS-verdeling, de top-5 meest/minst vertegenwoordigde klassen en scheefgroei-signalen (FR-11, UX-DR3).

**Given** de batch-card
**When** de datamanager de Historie-tab opent
**Then** ziet hij gepasseerde batches met een rollback-actie achter een bevestigingsmodal met verplicht redenveld (endpoint `batches/:id/rollback`); een teruggedraaide batch krijgt badge `teruggedraaid` en het baseline-herstel is zichtbaar in de precisietrend (FR-4 UI, UX-DR11).

**Given** een openstaande outlier-melding in het outlier-paneel
**When** de datamanager doorklikt
**Then** opent een vergelijkingsweergave (referentie naast klasse-genoten) met acties Behouden/Deactiveren, waarbij Deactiveren `active=false` zet (soft-delete, gelogd) via endpoint `outliers/:id/decision` (FR-8, UX-DR12).

**Given** de KPI-tegelrij
**When** het overzicht laadt
**Then** bevat die een element met het aantal openstaande quarantaines en hun ouderdom (SM-5)
**And** toont het overzicht een teller "gemiste nominaties" mét reden (phash-onbereikbaar / pauze / vlag-uit), gevoed door de 13.2-events, en de "laatste succesvolle run" van de promotielus (NFR-5).

**Given** de data-verversing
**When** de datamanager het scherm gebruikt
**Then** is er een verversknop en refresh-on-load, géén polling; bij verouderde data verschijnt een "verouderde data"-melding met handmatig vernieuwen (UX-DR8).

*Bronnen: FR-17, FR-4 (UI), FR-8 (beoordeling), FR-11; UX-DR3, UX-DR5, UX-DR8, UX-DR11, UX-DR12; AD-10; SM-5.*

### Story 15.3: Quarantaine-afhandeling met volledig bewijs

As a datamanager,
I want per kandidaat het volledige bewijs zien en per kandidaat afkeuren of vrijgeven,
So that ik een quarantainebatch in minuten afhandel zonder de poort te omzeilen (UJ-1, UJ-3).

**Acceptance Criteria:**

**Given** de batch-detailpagina (FlywheelBatchDetailPage, `/flywheel/batches/:id`, endpoint `batches/:id`)
**When** de datamanager een gequarantaineerde batch opent
**Then** ziet hij conform mock-quarantaine.html: faalreden, batchvoortgang, kandidatenlijst met statusbadges (master) en per kandidaat het bewijspaneel (crop naast referentie, scores, declaratieblok, poort-uitkomsten) (FR-18, UX-DR4)
**And** werkt toetsenbordnavigatie (A/R/U/pijltjes/Esc conform reviewstation) en zijn focus-states zichtbaar (UX-DR4, UX-DR9).

**Given** een afkeur-beslissing
**When** de datamanager afkeurt via `candidates/:id/decision`
**Then** wordt de kandidaat `rejected` + hard-negative (herbruik 14.1-route voor gold-set-aanwas indien van toepassing), via conditional update (FR-18, AD-16).

**Given** een vrijgave-beslissing
**When** de datamanager vrijgeeft
**Then** gaat de kandidaat terug naar status `candidate` en wordt hij door de eerstvolgende worker-run in een níeuwe batch gebundeld die opnieuw de volledige poort doorloopt — het endpoint draait zelf nooit poortlogica (FR-18, AD-15)
**And** geeft het endpoint HTTP 409 op kandidaten in een batch in verwerking (AD-16).

**Given** een batch waarvan alle kandidaten beoordeeld zijn
**When** de datamanager de actie "Batch afsluiten" gebruikt (pas dan actief)
**Then** toont een samenvattingsmodal het resultaat: N afgekeurd → hard-negative; M vrijgegeven → nieuwe batch die opnieuw door de poort gaat (FR-18, UX-DR4)
**And** springt de weergave na elke individuele beslissing automatisch door naar de volgende onbeoordeelde kandidaat (auto-advance; EXPERIENCE Component Patterns bindend) (UX-DR4).

*Bronnen: FR-18; AD-15, AD-16; UX-DR4, UX-DR9.*

### Story 15.4: Drempelbeheer en pauzebediening

As a datamanager,
I want drempels wijzigen met verplichte reden en het vliegwiel kunnen pauzeren en hervatten,
So that ik de lus bestuur in plaats van hem te moeten vertrouwen.

**Acceptance Criteria:**

**Given** de nieuwe Prisma-migratie voor `threshold_changes` (patroon `model_activation_logs`)
**When** de migratie wordt voorbereid
**Then** wordt deze ter expliciete goedkeuring voorgelegd (ARCH-2).

**Given** het drempelbeheer (endpoint `thresholds`)
**When** de datamanager een drempel wijzigt
**Then** is een redenveld verplicht, wordt oude+nieuwe waarde+gebruiker+reden gelogd in `threshold_changes`, en is de wijzigingshistorie zichtbaar in de UI (FR-5, AD-13, UX-DR7)
**And** toont het drempelbeheer de per-methode-drempels (template/embedding/classifier) elk afzonderlijk (FR-5).

**Given** de pauzeknop (endpoint `pause`)
**When** de datamanager pauzeert
**Then** volgt een bevestigingsmodal, daarna een persistente amber pauzebanner; hervatten is een expliciete actie (FR-19, UX-DR6).

**Given** een gepauzeerd vliegwiel
**When** de datamanager hervat
**Then** wordt de hervatting gelogd met gebruiker en tijdstempel (patroon `threshold_changes`) (NFR-5, AD-13)
**And** toont de hervat-modal eventuele openstaande quarantaines als waarschuwing, zonder de hervatting te blokkeren (FR-19).

**Given** een automatische stilstand (K=2, Story 13.6)
**When** het dashboard laadt
**Then** toont het een rode stilstand-banner met de aanleiding (enige rode toestand naast regressie-alarm) die linkt naar de betrokken batches, en is de notificatie via het bestaande patroon zichtbaar (FR-19, UX-DR5, UX-DR6).

*Bronnen: FR-5 (UI), FR-19 (UI); AD-11, AD-13; NFR-5; UX-DR6, UX-DR7; ARCH-2.*

## Epic 16: Mismatch-stromen als brandstof en datakwaliteitssignaal

Structurele verschillen tussen declaratie en detectie worden vastgelegd en vertaald naar werkvoorraad en rapporten. (FR-14, FR-15, FR-16 · AD-2, AD-13)

### Story 16.1: Mismatch-registratie en -aggregatie

As a datamanager,
I want dat elke verwerking vastlegt welke gedeclareerde codes bevestigd, niet gevonden of niet ondersteund waren én welke vondsten niet gedeclareerd waren,
So that de twee waardevolste datastromen van het vliegwiel niet langer verdampen.

**Acceptance Criteria:**

**Given** de nieuwe Prisma-migratie voor `mismatch_events`
**When** de migratie wordt voorbereid
**Then** wordt deze ter expliciete goedkeuring voorgelegd (ARCH-2).

**Given** een verwerking met declaratie (crosscheck- of kruischeck-pad)
**When** de flow afrondt
**Then** ontstaat per gedeclareerde code een `mismatch_events`-record met type `confirmed`, `declared-not-found` of `not-supported`, en per hoogbetrouwbare niet-gedeclareerde vondst een record met type `found-not-declared` (volledige typeset conform Structural Seed, zodat de FR-14-ratio bevestigd/niet-gevonden berekenbaar is), met GTIN, GLN, code, confidence en herkomst/runId (FR-14)
**And** telt voor `found-not-declared` alleen confidence ≥ promotiedrempel (FR-16-voorwaarde).

**Given** de vlag-scoping van de registratie
**When** een verwerking afrondt
**Then** registreert het crosscheck-pad mismatch-events onder de hoofdvlag `FLYWHEEL_NOMINATION_ENABLED`, en valt mismatch-registratie op het kruischeck-pad onder `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` — met die vlag uit schrijft het kruischeck-pad niets en blijft het verdict-pad contract-conform (AD-8).

**Story-taak:** afstemmoment met het n8n-/12.8-werk over de contractuitbreiding — het vlag-gedrag wordt gedocumenteerd in de 12.8-API-docs.

**Given** geaggregeerde events
**When** het dashboard de mismatch-trend opvraagt
**Then** zijn verhouding bevestigd/niet-gevonden per klasse en de trend over tijd beschikbaar via de overview-API, en vult het mismatch-paneel uit Story 15.2 zich (FR-14, UX-DR3).

*Bronnen: FR-14; AD-2, AD-8, AD-13; ARCH-2.*

### Story 16.2: Gedeclareerd-niet-gevonden wordt werkvoorraad

As a datamanager,
I want dat structurele gedeclareerd-niet-gevonden-patronen automatisch werkvoorraad worden,
So that de zwaktes van de bibliotheek zichzelf agenderen.

**Acceptance Criteria:**

**Given** de nieuwe Prisma-migratie voor `bootstrap_queue` (conform Structural Seed; deze story introduceert de wachtrij-data, Story 17.2 verwijst ernaar)
**When** de migratie wordt voorbereid
**Then** wordt deze ter expliciete goedkeuring voorgelegd (ARCH-2).

**Given** een code met ≥10 declared-not-found-events over ≥5 verschillende GTINs (configureerbaar)
**When** de aggregatie draait
**Then** verschijnt de klasse automatisch in de bootstrap-wachtrij (klassen zonder actieve referenties) of als aanvul-signaal (klassen met zwakke dekking) (FR-15)
**And** is de wachtrij-/signaaldata zichtbaar in het dashboard-paneel (Epic 17 automatiseert de verwerking; deze story levert de zichtbare werkvoorraad).

**Given** een werkvoorraad-item
**When** de datamanager doorklikt
**Then** zijn de onderliggende GTINs en verwerkingen opvraagbaar (herleidbaarheid, FR-15, NFR-1).

*Bronnen: FR-15; AD-13; NFR-1; ARCH-2.*

### Story 16.3: Datakwaliteitsrapport gevonden-niet-gedeclareerd

As a datamanager,
I want een exporteerbaar periodiek overzicht van keurmerken die wél op verpakkingen staan maar níet gedeclareerd zijn,
So that ik leveranciers gericht op declaratie-omissies kan wijzen.

**Acceptance Criteria:**

**Given** de `found-not-declared`-events van een periode
**When** de datamanager het rapport opvraagt
**Then** is het gegroepeerd per informatieleverancier (GLN) en bevat het per geval GTIN, code, confidence en bronbestand — voldoende voor menselijke verificatie (FR-16)
**And** is het exporteerbaar vanuit het dashboard via endpoint `reports/data-quality` (FR-16, UX-DR3).

**Given** de bronrestrictie
**When** het rapport of de export wordt samengesteld
**Then** bevat het uitsluitend eigen crops en verwijzingen — nooit GS1-gidsbeelden (NFR-6).

*Bronnen: FR-16; NFR-6; AD-13.*

### Story 16.4: Controle-cohort voor de bevestigingsgraad-trend

As a datamanager,
I want een vast controle-cohort (~100 GTINs) dat maandelijks herverwerkt wordt,
So that de stijging van de CONFIRMED-ratio aantoonbaar toe te schrijven is aan referentiegroei en niet aan een veranderde productmix (SM-3).

**Acceptance Criteria:**

**Given** het controle-cohort
**When** het wordt vastgelegd
**Then** is de cohort-definitie (~100 GTINs) expliciet vastgelegd en stabiel over runs heen (SM-3).

**Given** de maandelijkse cadans
**When** de herverwerkings-job draait (queue `flywheel`, via Job Scheduler)
**Then** wordt het cohort herverwerkt en de CONFIRMED-ratio per cohort-run vastgelegd (SM-3).

**Given** de vastgelegde cohort-runs
**When** het dashboard de trend opvraagt
**Then** is de ratio-trend per cohort-run opvraagbaar via de overview-API (SM-3, FR-17).

**Given** de pauzestand of de live-detectiestroom
**When** de herverwerking draait
**Then** respecteert die de pauze-scope (AD-11) en de isolatie-eis: geen impact op de live-detectiestroom (NFR-3).

*Bronnen: SM-3; AD-6, AD-11; NFR-3.*

## Epic 17: Seed-bootstrap voor lege klassen

Klassen zonder referenties vullen zichzelf met echte crops, via de normale kwaliteitspoort. (FR-12, FR-13 · AD-6, AD-8, AD-9)

### Story 17.1: Bootstrap-run per lege klasse

As a datamanager,
I want dat een klasse zonder referenties zichzelf vult met echte crops uit declarerende producten,
So that ook onbediende keurmerken herkenbaar worden zonder handwerk (UJ-2).

**Acceptance Criteria:**

**Given** een T3777-code zonder actieve referenties en met het gids-logo als zoekzaad
**When** de job `flywheel-bootstrap` draait (queue `flywheel`, on-demand/gequeued)
**Then** zoekt hij uitsluitend binnen GTINs die de code declareren en nomineert vondsten ≥ `FLYWHEEL_BOOTSTRAP_THRESHOLD` (default 0,93) als kandidaat met herkomst `bootstrap` (FR-12, AD-8, AD-9)
**And** doorlopen bootstrap-kandidaten exact dezelfde kwaliteitspoort als reguliere kandidaten (FR-12).

**Given** het gids-logo
**When** de run afrondt
**Then** komt het zaad zelf nooit als referentie in de bibliotheek en blijft het beperkt tot het zoekpad (FR-12, NFR-6).

**Given** een run zonder vondsten
**When** de run afrondt
**Then** wordt hij vastgelegd als `leeg` en keert de klasse terug in de wachtrij (FR-12).

**Given** een bootstrap-run met veel wachtende klassen
**When** de job draait
**Then** verwerkt hij per run maximaal `FLYWHEEL_BOOTSTRAP_RUN_BUDGET` GTINs (default 200) binnen een time-box; het restant blijft in de wachtrij voor een volgende run (run-budget; FR-12, AD-6, NFR-3).

**Given** de pauzestand actief
**When** de job start
**Then** draait hij niet (AD-11 pauze-scope).

**Given** `FLYWHEEL_NOMINATION_ENABLED=false`
**When** een bootstrap-run gepland of gestart zou worden
**Then** draait hij niet en nomineert hij niets (AD-8).

*Bronnen: FR-12; AD-6, AD-8, AD-9, AD-11; NFR-6.*

### Story 17.2: Bootstrap-wachtrij — prioritering en beheer

As a datamanager,
I want de bootstrap-wachtrij op declaratiefrequentie geprioriteerd zien en kunnen bijsturen,
So that de meest voorkomende ongedekte keurmerken het eerst gevuld worden.

**Acceptance Criteria:**

**Given** de tabel `bootstrap_queue` (migratie belegd in Story 16.2)
**When** de wachtrij initieel gevuld wordt
**Then** bevat hij álle klassen zonder actieve referenties, gerangschikt op declaratiefrequentie over het GTIN-universum; FR-15-events zijn een aanvullende bron (FR-13).

**Given** de wachtrij (gevoed door de initiële vulling, FR-15-werkvoorraad en handmatige toevoeging)
**When** het dashboard-paneel laadt
**Then** toont het per klasse: declaratiefrequentie, status (wachtend/gedraaid/gevuld/leeg/uitgesloten), gesorteerd op frequentie (FR-13)
**And** kan de datamanager via endpoint `bootstrap-queue` de volgorde overrulen, klassen uitsluiten en klassen toevoegen (FR-13).

**Given** een geslaagde bootstrap (klasse van 0 naar ≥1 actieve referentie na poort-passage)
**When** het overzicht ververst
**Then** verschijnt de klasse als "nieuw geactiveerde klasse" (FR-13, UX-DR8).

**Given** een "nieuw geactiveerde klasse"-melding
**When** de datamanager doorklikt
**Then** toont de batch-detail-weergave (Story 15.3) de gepromoveerde referenties met hun evidence-contract (herkomst `bootstrap`) (FR-13, NFR-1).

*Bronnen: FR-13; UX-DR3, UX-DR8; NFR-1.*

## Epic 18: Brandstofvergroting — GLN-dekking voor het 39k-archief

Het historische archief krijgt GLN-dekking zodat dubbele bevestiging mogelijk wordt. (FR-21 · AD-7 · ARCH-8)

### Story 18.1: GLN-backfill via batch-export

As a datamanager,
I want dat historische artwork-records hun GLN krijgen via een eenmalige export uit de productbron,
So that het 39k-archief declaratie-lookup en dubbele bevestiging kan krijgen.

**Acceptance Criteria:**

**Given** het go/no-go-moment
**When** de story start
**Then** wordt eerst expliciet governance-akkoord gevraagd voor de eenmalige read-only MongoDB-export op prod tradeItems (off-peak); zonder akkoord stopt de story hier (AD-7, ARCH-8).

**Given** akkoord en het idempotente exportscript (met `--dry-run` die alleen het plan toont)
**When** de backfill draait
**Then** worden `artwork_imports.gln`-waarden gevuld vanuit de export + Redis-preload van declaraties, zonder bestaande niet-lege GLN's te overschrijven (FR-21, AD-7)
**And** krijgt elk record zonder vaststelbare GLN een gemarkeerde uitvalreden — geen stille uitval (FR-21).

**Given** de afgeronde run
**When** het dashboard de dekkingsgraad toont
**Then** is het percentage records-met-GLN zichtbaar (doel ≥90%) inclusief uitval-verdeling per reden (FR-21, UX-DR3).

*Bronnen: FR-21; AD-7; ARCH-4 (seeds), ARCH-8.*

### Story 18.2: Restant-route via mediaserver-re-import

As a datamanager,
I want dat het restant zonder GLN via de bestaande re-importroute alsnog gedekt wordt,
So that de dekkingsgraad richting het doel kruipt zonder nieuwe mechanismen.

**Acceptance Criteria:**

**Given** records met uitvalreden na Story 18.1
**When** de terugval-route draait (bestaand mediaserver-backfill-mechanisme, 8-3O)
**Then** worden resterende GLN's per re-import gevuld en de uitvalreden bijgewerkt (FR-21, AD-7)
**And** blijft de verwerking batch-gewijs en CPU-getemperd — batch-grootte en pauze-interval zijn configureerbaar via envvars (`FLYWHEEL_`-prefix) met conservatieve defaults — zodat de live-verwerking er geen last van heeft (NFR-3).

**Given** de afgeronde terugval-run
**When** de dekkingsgraad opnieuw gemeten wordt
**Then** toont het dashboard de bijgewerkte dekking en het definitieve restant met redenen (FR-21).

*Bronnen: FR-21; AD-7; NFR-3.*

---

## Epic 19: Gerichte brandstofselectie via declaraties

Het vliegwiel wordt gericht gevoed in plaats van het hele archief blind te verwerken: via de GS1-declaraties selecteren we etiketten die gegarandeerd een gedeclareerd keurmerk bevatten, gebalanceerd per keurmerk (configureerbaar N/klasse, tot de class-cap), en voeren ze via het bestaande nominatiepad door de kwaliteitspoort. Vooraf ontsluit een spike de ACC-verwerkingstoegang (media-index + catalog-baseline; de artwork-bestanden staan al gesynct sinds 2026-06-08) en meet de werkelijke keurmerk-dekking, zodat de bouwstories op feiten rusten. Na deze epic wordt de brandstoftank niet alleen ontsloten (Epic 18) maar ook gericht en gebalanceerd benut. (FR-22 + dekkingsuitbreiding op FR-1/12/15/20 · AD-1/AD-2/AD-6/AD-9 · ARCH-4)

**FRs covered:** FR-22 (de 5/5-veld-dekking raakt tevens FR-1, FR-12, FR-15, FR-20)

**Volgorde:** 19.1 (spike) is een harde voorwaarde voor 19.3/19.4 (route + dekkingscijfers); 19.2 (parser) kan parallel en is nodig vóór een volledige 19.3-index.

### Story 19.1: Spike — ACC-verwerkingstoegang en keurmerk-dekkingsmeting

As a datamanager/ontwikkelaar,
I want de ACC-verwerkingstoegang tot het gesyncte 39k-corpus ontsluiten en de werkelijke keurmerk-dekking meten,
So that de bouwstories op een bewezen toegangsroute en echte dekkingscijfers rusten.

**Acceptance Criteria:**

**Given** de twee toegangsroutes
**When** de spike de route bepaalt
**Then** wordt gekozen tussen Route A (ACC-env `MEDIASERVER_DOMAIN`/`CATALOG_API_BASE`→prod, mits de prod-media-503 verklaard/opgelost is) en Route B (resterende DB-replicatie: prod media-index → ACC Cherry MySQL `xxtractdbmedia`, en prod `tradeItems` → ACC Cherry MongoDB `application`; de artwork-bestanden staan al gesynct)
**And** wordt voor elke ACC-DB-schrijf en containerherstart eerst expliciete toestemming gevraagd (Constraint 1 / database-veiligheid).

**Given** de gekozen route (proof-of-access)
**When** een handvol GTINs verwerkt wordt
**Then** leveren discovery + download + crosscheck een geslaagde dubbele bevestiging (crops + declaratie) — read-only op prod waar van toepassing, geen productiewijziging zonder aparte toestemming.

**Given** de declaratiebron
**When** de dekkingsmeting over de artwork-GTINs draait
**Then** ontstaat een dekkingsrapport: per keurmerkcode (getoetst aan het 951-code-universum, `Result_4.xlsx`) het aantal producten mét etiket, de scheefheid en de lege klassen — als go/no-go-input voor de sampler (19.4).

*Bronnen: FR-22; AD-6; ARCH-4; besluit-39k-toegang-2026-06-07. Spike-deliverable: routebesluit + dekkingsrapport.*

### Story 19.2: Declaratie-parser naar volledige keurmerk-dekking (5/5 velden)

As a ontwikkelaar,
I want de declaratie-lezer alle vijf GDSN-keurmerkvelden laten herkennen,
So that het vliegwiel geen keurmerken meer mist die in `enumerationValue` of het aanvullende-logo-veld staan.

**Acceptance Criteria:**

**Given** `parseDeclaredMarks`/`MARK_FIELDS` in `apps/api/src/services/t3777-declarations.ts` (nu 3 velden)
**When** de story klaar is
**Then** herkent de lezer ook `enumerationValue` (`consumerInstructionsModule/consumerInstructions/consumerUsageLabelCode/enumerationValueInformation/enumerationValue`) en `localPackagingMarkedLabelAccreditationCodeReference` (`packagingMarkingModule/packagingMarking/localPackagingMarkedLabelAccreditationCodeReference`), elk met de juiste `fieldType`/codelijst-mapping.

**Given** de bestaande afnemers (crosscheck FR-1, kruischeck FR-20, bootstrap FR-12, mismatch FR-15)
**When** de dekking uitbreidt
**Then** blijft het gedrag voor de al-gedekte 3 velden byte-gelijk, zijn de 2 nieuwe velden namespace-agnostisch geparsed (local-name), en is er een unit-test per veld.

*Bronnen: FR-22 (dekking); raakt FR-1/12/15/20; codelijst-universum `Result_4.xlsx`.*

### Story 19.3: Keurmerk→etiket-index uit declaraties

As a datamanager,
I want een keurmerk→etiket-index uit de declaraties,
So that ik per keurmerk weet welke etiketten het gegarandeerd bevatten.

**Acceptance Criteria:**

**Given** het artwork-GTIN-universum en de declaratiebron
**When** het idempotente indexscript draait (met `--dry-run` die alleen het plan toont)
**Then** ontstaat een index `{keurmerkcode → [GTIN → etiketbestand(en)]}` + tellingen per code, gelezen via de betrouwbare catalog-XML-lezer (niet de diep-geneste, ongeïndexeerde Mongo-vorm), getoetst aan het 951-code-universum.

**Given** ARCH-4 (operationele envelope)
**When** het script wordt opgeleverd
**Then** is het een handmatig, idempotent seed-script met droge-run; de output staat in beheerde opslag; herdraaien wijzigt niets ongewenst (idempotentie, NFR-4).

*Bronnen: FR-22; ARCH-4; AD-9; afhankelijk van 19.2 (volledige velddekking) en 19.1 (toegang).*

### Story 19.4: Gebalanceerde sampler en nominatie-aansluiting

As a datamanager,
I want per keurmerk N gebalanceerde etiketten door de poort voeden,
So that elke keurmerkklasse sterk vertegenwoordigd de referentiebibliotheek in groeit tot de cap.

**Acceptance Criteria:**

**Given** de index (19.3)
**When** de sampler draait
**Then** kiest hij per keurmerkcode tot N etiketten (configureerbaar via een `FLYWHEEL_`-envvar met conservatieve default), gebalanceerd, en voert de geselecteerde etiketten via het bestaande nominatie-/bootstrap-pad (passende herkomst) door de kwaliteitspoort — nooit rechtstreeks in `reference_logos`; gate, tweetraps-dedup en class-cap worden gerespecteerd (AD-1/AD-2; FR-2/6/7).

**Given** de class-cap (start 10)
**When** een klasse zijn cap bereikt
**Then** stopt de selectie voor die klasse en wordt overschot geregistreerd als overgeslagen mét reden — geen stille brandstofverliezen (NFR-5).

**Given** de vliegwiel-vlaggen (default uit)
**When** de sampler in productie zou draaien
**Then** gebeurt dat achter de bestaande nominatie-vlag en met expliciete toestemming voor elke ACC-schrijf/herstart (Constraint 1).

*Bronnen: FR-22; AD-1/AD-2/AD-6; FR-2/6/7; NFR-5; afhankelijk van 19.1 + 19.3.*

---

## Uitbreiding 2026-07-11 — herkenningsherstel uit ACC-diagnose

*Drie begrensde fix-stories uit de read-only ACC-diagnose van 2026-07-11 (geheugen `project_recyclable_dead_refs`), verscherpt na een adversariële review + gerichte ACC-verificatie op 2026-07-11.*

***Uitvoervolgorde: 19.14 → 19.12 → 19.13*** *(nummers blijven ongewijzigd; de index-fix draait eerst omdat hij losstaat, laag risico is en de top-1-metingen van 19.13 pas betrouwbaar maakt).*

*Geverifieerde uitgangspunten: `FLYWHEEL_NOMINATION_ENABLED=true` op ACC; er bestaan **0** `flywheel-promotion`-referenties (van welk keurmerk dan ook) → onder de live-vlag wordt geen enkele menselijke goedkeuring een actieve referentie. De 125 `review-confirmed` refs zijn historisch (vlag-uit-tijdperk). ivfflat-index `idx_reference_embeddings_embedding` heeft `lists=100` op 215 rijen (staat NIET in de repo-migraties). `logo_embeddings` heeft géén ivfflat-index. Embeddingmodel NIET stale (cosine 1,0 vers vs opgeslagen); bibliotheek verder gezond (215 actieve refs volledig gevuld).*

### Story 19.12: Menselijke accept = grondwaarheid → directe actieve referentie

As a kwaliteitsbeheerder,
I want dat een expliciete menselijke goedkeuring (accept) van een review-crop áltijd direct een actieve referentie oplevert — ongeacht de nominatie-vlag,
So that menselijke grondwaarheid niet stil verloren gaat aan automatische drempels die voor onbevestigde nominaties bedoeld zijn, en de bibliotheek voor élk keurmerk betrouwbaar groeit.

**Geverifieerde oorzaak (niet de eerder vermoede "class-exists skip"):** onder `FLYWHEEL_NOMINATION_ENABLED=true` enqueue't de accept-handler een *nominatie* (herkomst `review`) i.p.v. direct te registreren (`artwork-pipeline.ts` accept-tak, ~regel 1106-1120). Die nominatie moet vervolgens de automatische promotie-guardrails (crosscheck-drempel 0,80, promotiedrempel) passeren, wat echte crops (~0,70 cosine) niet halen. Gevolg: **0 `flywheel-promotion`-referenties bestaan** — menselijke goedkeuringen worden voor geen enkel keurmerk een referentie. De vlag-uit-tak (`~1121-1147`) registreert wél direct (`register_crop_as_reference`, `source='review-confirmed'`).

**Acceptance Criteria:**

**Given** `FLYWHEEL_NOMINATION_ENABLED=true` (de live-toestand)
**When** een reviewer een crop expliciet bevestigt (accept in de review-queue)
**Then** ontstaat direct een actieve referentie (`active=true`, `source='review-confirmed'`) MET embedding, zónder dat de crosscheck-/promotiedrempels de mens-bevestigde crop kunnen droppen — de menselijke accept is grondwaarheid.

**Given** een keurmerkklasse waarvan alle bestaande `reference_logos`-rijen inactief zijn (of geen embedding hebben)
**When** een crop voor die klasse wordt geaccepteerd
**Then** blokkeert de aanwezigheid van die dode rijen de nieuwe actieve referentie niet; idempotentie geldt per `storage_path` (geen dubbele actieve referentie voor dezelfde crop).

**Given** de reopen/relabel-symmetrie
**When** een geaccepteerd item wordt heropend
**Then** deactiveert de bijbehorende zojuist-aangemaakte actieve referentie mee (de deactivatie-conditie dekt de bron die 19.12 aanmaakt — huidige reopen raakt alleen `source='review-confirmed'`; bevestig dat de nieuwe referenties díe bron gebruiken zodat de symmetrie klopt).

**Given** een falende regressietest die het huidige gat aantoont (accept onder vlag-aan → geen actieve referentie)
**When** de fix is toegepast
**Then** bewijst de test (rood→groen) dat accept een actieve referentie + embedding produceert, ook voor een klasse met bestaande inactieve refs.

*Bronnen: diagnose + ACC-verificatie 2026-07-11; code `apps/api/src/api/v1/artwork-pipeline.ts` (accept-review-item, ~1106-1147), `apps/api/src/services/flywheel/promotion.ts` (`PROMOTION_SOURCE`, guardrails), `apps/ml-service/app/services/similarity.py:316` (`register_crop_as_reference`). Raakt álle keurmerken, niet alleen RECYCLABLE. Overlapt bewust met de crosscheck-vloer-vraag (resume Task 2) maar is onderscheiden: dit gaat over mens-bevestigde accepts, niet auto-confirm van onbeoordeelde matches.*

### Story 19.13: RECYCLABLE-referenties herstellen

As a datamanager,
I want RECYCLABLE_GENERAL_CLAIM weer herkend krijgen door z'n echte-crop-referenties te herstellen,
So that echte recycle-logo's correct worden geclassificeerd in plaats van als FAIRTRADE_COCOA/EU_ORGANIC.

**Geverifieerde nuance:** de 26 dode refs (`source='realref-live-poc'`) zijn een ándere populatie dan de review-crops uit 19.8 — ze zijn door het POC-script ingeschoten, hebben geen review-items, en kunnen dus NIET via het 19.12-accept-pad worden hersteld. `realref_live.py` kent bovendien geen "reactiveren + embedding-herbouwen"-pad (alleen `_revert`=DELETE → re-INSERT met `active=true`). Hoe de 26 rijen aan `active=false` + 0 embeddings kwamen is onverklaard. 19.13 vereist daarom een NIEUW, idempotent herstelscript.

**Acceptance Criteria:**

**Given** de 26 dode RECYCLABLE-referenties (`source='realref-live-poc'`, `active=false`, 0 embeddings; enige code met dit patroon — de 2 losse Beter Leven dode rijen vallen expliciet BUITEN scope)
**When** het herstelscript draait (read-only verificatie eerst, dan mutatie met toestemming)
**Then** krijgt elke valide crop (herlaadbaar via `storage_path` uit MinIO) weer een embedding + `active=true`, idempotent (herdraaien verandert niets); crops die niet meer laadbaar zijn worden overgeslagen mét telling.

**Given** de ~26 crops collapsen naar bijna-identieke embeddings (line-art, ~86% transparant) en de legacy near-dup-guard blokkeert `>=0,97`
**When** het script de refs herstelt
**Then** kiest de story expliciet één beleid — herstel alle 26 (over-representatie geaccepteerd) OF dedup tot een representatieve subset — en legt het verwachte eindaantal vast zodat "zonder duplicaten" meetbaar is.

**Given** herstelde RECYCLABLE-referenties
**When** een echte RECYCLABLE-crop wordt geclassificeerd (`/ml/artwork/classify` op ACC, poort 8011)
**Then** is de top-1 `RECYCLABLE_GENERAL_CLAIM`, gemeten met een benoemd, herbruikbaar meetscript tegen een gecommit gold-set/crop-lijst (POC bewees 0%→100%); draait ná 19.14 zodat de index-top1 betrouwbaar is.

**Given** de precisie van andere keurmerken
**When** RECYCLABLE hersteld is
**Then** neemt het aantal valse RECYCLABLE-matches niet toe — dezelfde vóór/na-meting toont behoud van precisie.

*Bronnen: diagnose + ACC-verificatie 2026-07-11; `apps/ml-service/scripts/realref_live.py` (referentie, niet herbruikbaar as-is). Onafhankelijk van 19.12 voor deze 26 (eigen scriptpad); 19.12 dekt wél toekomstige review-goedkeuringen. Constraint: ACC-schrijf alleen met expliciete toestemming, read-only verificatie vooraf.*

### Story 19.14: ivfflat-index onder-fetch corrigeren

As a systeembeheerder,
I want dat de nearest-neighbor-zoek de werkelijke dichtstbijzijnde referenties teruggeeft,
So that herkenning niet stilletjes buren mist door een verkeerd geconfigureerde vector-index.

**Geverifieerde oorzaak:** `idx_reference_embeddings_embedding` is `ivfflat (embedding vector_cosine_ops) WITH (lists='100')` op maar 215 rijen → ~2 rijen per cluster, met `probes=1` scant de query 1 cluster → ~1 buur. De index staat NIET in de repo-migraties (ad-hoc op ACC aangemaakt); `logo_embeddings` (detector-pad) heeft géén ivfflat-index en is dus niet geraakt — scope beperkt tot `reference_embeddings`.

**Acceptance Criteria:**

**Given** de degenererende ivfflat-index (lists=100 op 215 rijen, probes=1)
**When** `find_similar_references` met `limit=N` draait
**Then** geeft die tot N werkelijke naaste buren terug (niet stelselmatig ~1) — geverifieerd met een vóór/na-meting: index-top1 vs exact(seqscan)-top1 agreement over een steekproef.

**Given** dat de fix committeerbaar moet zijn terwijl de index niet in de repo staat
**When** de oplossing wordt gekozen
**Then** wordt die verankerd in code/migratie — óf een migratie die de index met passende `lists` (≈√N) (her)definieert of dropt (seqscan is prima bij deze N), óf `SET LOCAL ivfflat.probes` binnen een expliciete transactie in `find_similar_references` (nooit kale `SET` op de pooled connectie — dat lekt naar hergebruikte queries).

**Given** een regressietest die de under-fetch reproduceert
**When** de test draait
**Then** bouwt hij eerst een gevulde ivfflat-index in de degenererende toestand op (anders doet Postgres seqscan en reproduceert de bug niet), en bewijst rood→groen dat de fix tot N buren teruggeeft.

*Bronnen: diagnose + ACC-verificatie 2026-07-11; `apps/ml-service/app/services/database.py:601` (`find_similar_references`), migratie `0005_add_reference_embeddings`. Onafhankelijk, laag risico; raakt herkenning van álle codes via de referentie-match. Constraint: index-herbouw/REINDEX op ACC alleen met expliciete toestemming.*
