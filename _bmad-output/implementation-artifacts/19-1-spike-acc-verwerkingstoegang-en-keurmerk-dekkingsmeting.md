# Story 19.1: Spike — ACC-verwerkingstoegang en keurmerk-dekkingsmeting

Status: done

<!-- Aangemaakt via prepare-sprint (bmad-sprint-planning + create-story-vorm), 2026-07-04. Bron: epics-vliegwiel.md Epic 19 / Story 19.1; sprint-change-proposal-2026-07-04.md. -->

## Story

Als **datamanager/ontwikkelaar**
wil ik **de ACC-verwerkingstoegang tot het gesyncte 39k-corpus ontsluiten en de werkelijke keurmerk-dekking meten**
zodat **de bouwstories (19.2-19.4) op een bewezen toegangsroute en echte dekkingscijfers rusten** (FR-22).

### Afbakening (kritiek)

- **Dit is een SPIKE — onderzoek + besluit, geen productiebouw.** Deliverables: (1) een routebesluit (A of B) met bewijs, (2) een dekkingsrapport per keurmerk. Geen nieuwe pijplijn-code die blijft staan.
- **Elke ACC-DB-schrijf en containerherstart vereist expliciete toestemming per geval** (database-veiligheid KRITIEK, Constraint 1). Route B raakt twee ACC-databases (Cherry MySQL `xxtractdbmedia` + Cherry MongoDB `application`) — niets schrijven zonder akkoord.
- **Prod = read-only.** Metingen en discovery-tests tegen prod zijn uitsluitend lezend.
- De eigenlijke sampler/nominatie is Story 19.4; de parser-uitbreiding is 19.2; de index is 19.3. Deze story levert alleen het fundament (route + cijfers).

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 19.1)*

1. **Given** de twee toegangsroutes
   **When** de spike de route bepaalt
   **Then** wordt gekozen tussen **Route A** (ACC-env `MEDIASERVER_DOMAIN`/`CATALOG_API_BASE`→prod, mits de prod-media-503 verklaard/opgelost is) en **Route B** (resterende DB-replicatie: prod media-index → ACC Cherry MySQL `xxtractdbmedia`, en prod `tradeItems` → ACC Cherry MongoDB `application`; de artwork-bestanden staan al gesynct)
   **And** wordt voor elke ACC-DB-schrijf en containerherstart eerst expliciete toestemming gevraagd.

2. **Given** de gekozen route (proof-of-access)
   **When** een handvol GTINs verwerkt wordt
   **Then** leveren discovery + download + crosscheck een geslaagde dubbele bevestiging (crops + declaratie) — read-only op prod waar van toepassing, geen productiewijziging zonder aparte toestemming.

3. **Given** de declaratiebron
   **When** de dekkingsmeting over de artwork-GTINs draait
   **Then** ontstaat een dekkingsrapport: per keurmerkcode (getoetst aan het 951-code-universum, `Result_4.xlsx`) het aantal producten mét etiket, de scheefheid en de lege klassen — als go/no-go-input voor de sampler (19.4).

## Tasks / Subtasks

- [ ] 1. **Prod-media-503 verklaren (AC: 1)** — uitzoeken waarom `https://media.xxtract.com/uploaded` 503 geeft (Apache-proxy down? allowlist? interne route via 10.0.0.2?). Uitkomst bepaalt of Route A leefbaar is.
- [ ] 2. **Route-afweging documenteren (AC: 1)** — A vs B tegen elkaar: reachability, prod-load/governance, versheid, benodigde ACC-schrijven. Aanbeveling + besluit vastleggen. Bij Route B: exact welke rijen/documenten gerepliceerd worden (prod `xxtractdbmedia.media` voor de gesyncte corpus → Cherry; prod `application.tradeItems` voor de corpus-GTINs → Cherry).
- [ ] 3. **Proof-of-access (AC: 2)** — met de gekozen route een handvol GTINs end-to-end: discovery (`mediaServerClient.discoverArtwork`) → download → crosscheck (`t3777-declarations` + `artwork-crosscheck`) → aantoonbare dubbele bevestiging. Read-only op prod; ACC-schrijf alleen na akkoord.
- [ ] 4. **Dekkingsmeting (AC: 3)** — over de artwork-GTINs de declaraties lezen (catalog-XML, betrouwbare lezer) en tellen per keurmerkcode tegen het 951-universum (`~/Documents/Result_4.xlsx`, 5 GS1-codelijsten). Rapport: per code #producten-met-etiket, scheefheid, lege klassen. Let op: gebruik de **5/5-velddekking** (leun op 19.2 of neem de 2 extra velden tijdelijk mee in het meetscript).
- [ ] 5. **Spike-rapport opleveren** — routebesluit + dekkingsrapport als markdown in `_bmad-output/implementation-artifacts/` (spike-output), met de go/no-go-input voor 19.3/19.4.

## Dev Notes — Developer Context

### Bindende beslissingen / context (geverifieerd 2026-07-04, deze sessie)
- **Bestanden staan al op ACC** (rsync juni 2026, besluit-39k-toegang): `/mnt/storagebox-home/acc/TXmedia` (84k bestanden / 163 GB). Blokkade is de **index + declaraties op ACC**, niet de bestanden.
- **Gap 1 (index):** ACC-media-index = MySQL `xxtractdbmedia.media` op Cherry (10.0.0.6); discovery `/uploaded?gtin=` geeft `active:[]` voor de verse corpus. Prod-index = zelfde DB-naam op prod-DB (10.0.0.8).
- **Gap 2 (declaraties):** ACC-catalog geeft 200 voor geïmporteerde GTINs, mist baseline voor de verse; prod `application.tradeItems` (Mongo) heeft ze wél. `_id`-formaat `{gln}-{gtin14}-{targetMarket}`.
- **Corpus:** prod `/media/Xmedia/{GLN}/label/{mediaId}/{hash}.pdf|.png` — 151 GLNs/partijen, ~12.526 GTINs, ~39k bestanden. Eén GLN (`8710105000004`) heeft al 2213 producten in tradeItems.
- **App-config (Route A):** `MEDIASERVER_DOMAIN` (`apps/api/src/services/mediaserver-client.ts:80`, default `media.acc.xxtract.com`, `/uploaded` zonder API-key) en `CATALOG_API_BASE`+`CATALOG_API_KEY` (`apps/api/src/services/t3777-declarations.ts:69`, default `catalog.acc.xxtract.com`).
- **Class-cap = 10** (`FLYWHEEL_CLASS_CAP`): je hoeft niet alle 39k te verwerken; een diverse steekproef per klasse volstaat.

### Testrichtlijnen
- Spike = throwaway-analyse; meetscripts in scratchpad/implementation-artifacts, geen productie-pijplijn-code. Bevindingen zijn de input voor 19.2-19.4.

### Project context reference
- `sprint-change-proposal-2026-07-04.md`; `besluit-39k-toegang-2026-06-07.md`; geheugen `project_prod_corpus_route`, `project_acc_bulk_data_gaps`, `project_acc_autodeploy`.

## Dev Agent Record

### Agent Model Used
_(in te vullen bij uitvoering)_

### Spike-bevindingen deel 1 — ROUTEBESLUIT (2026-07-04, read-only)

**Route A is haalbaar en aanbevolen.** De prod-media-503 was een rode haring: `media.xxtract.com` (503) en `catalog.xxtract.com` (000) zijn dode legacy-hosts. De **echte werkende prod-endpoints draaien op `.stage.xxtract.com`** (ondanks "stage" draaien ze op Banana-PROD en serveren de echte `/media/Xmedia`-corpus; traefik-Host = `media.stage.xxtract.com`):

- `https://media.stage.xxtract.com/uploaded?gtin=…` → **HTTP 200 met echte artwork** (geverifieerd op 3 GTINs met bekende artwork: active-arrays met previewUrl/fileName/thumbnailUrl).
- `https://catalog.stage.xxtract.com/api/tradeitemxml/…` → **HTTP 401** (host werkt, alleen prod-key nodig).

**Aanbevolen Route A-config op ACC (alleen env, GEEN ACC-DB-schrijf → Route B niet nodig):**
- `MEDIASERVER_DOMAIN=https://media.stage.xxtract.com`
- `CATALOG_API_BASE=https://catalog.stage.xxtract.com`
- `CATALOG_API_KEY=<prod/stage-key uit de prod-catalog-container-env>`

Aandachtspunt: ACC→prod-leeskoppeling (read-only); tempering/NFR-7-cache bij bulk-download. Env-wijziging + ACC-containerherstart = bewuste stap MET expliciete toestemming (Constraint 1).

### Nog te doen binnen 19.1 (deel 2)
- Dekkingsmeting per keurmerkcode over de artwork-GTINs tegen het 951-universum (leunt op 19.2's 5/5-parser; catalog-XML-lezer).
- Proof-of-access end-to-end op ACC met de Route A-env (vereist env-wijziging + toestemming).

### Spike-bevindingen deel 2 — PROOF-OF-ACCESS + DEKKINGSMETING (2026-07-05)

**Route A geactiveerd op ACC** (akkoord Friso): `MEDIASERVER_DOMAIN=https://media.stage.xxtract.com` + `CATALOG_API_BASE=https://catalog.stage.xxtract.com` in Coolify + **redeploy** (een *restart* past env niet toe; `deploy_by_tag_or_uuid` recreëert de compose-stack). `CATALOG_API_KEY` ongewijzigd (bestaande ACC-key werkt op catalog.stage).

**Proof-of-access geslaagd (AC2):** GTIN 08712392291752 via de live app-config → media.stage geeft artwork én catalog.stage geeft de declaratie (HTTP 200) met `EU_ORGANIC_FARMING` (packagingMarked), `ORGANIC` (dietType) en `PREGNANCY_WARNING` (enumerationValue → nieuw 5/5-veld). Dubbele bevestiging end-to-end aangetoond.

**Dekkingsmeting (AC3)** — steekproef 400 artwork-GTINs, zie `spike-19-1-dekkingsrapport-2026-07-05.md`:
- 64% heeft een catalog-declaratie; **40% draagt ≥1 keurmerk** (dubbel-bevestigbare brandstof; ~5.000 producten geëxtrapoleerd op de corpus).
- Sterk scheef (RECYCLABLE/TRIMAN/GREEN_DOT domineren, lange staart) → **bevestigt de noodzaak van de gebalanceerde sampler (19.4)**.
- Nieuw veld `EU_consumerUsageLabelCodeList` = 27/400 producten → 5/5-parser (19.2) betaalt zich uit.

### Completion Notes
Spike afgerond: routebesluit (Route A, live), proof-of-access geslaagd, dekkingsrapport opgeleverd. Deblokkeert 19.3 (index) + 19.4 (sampler). NB: spike = onderzoek/besluit; geen AC→test-codegate van toepassing (deliverables zijn het routebesluit + het rapport). Meetscript: `scratchpad/coverage.js` (wegwerp).

## Change Log
- 2026-07-04: aangemaakt via prepare-sprint (Epic 19, correct-course).
