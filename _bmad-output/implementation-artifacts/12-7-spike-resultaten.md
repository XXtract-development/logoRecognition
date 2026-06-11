# Story 12.7 — Spike-resultaten: gedeclareerde GS1-waarden als label-prior

Datum 2026-06-10. Fase A (spike) uitgevoerd. **Conclusie: GO**, met een duidelijk afgebakende scope
(de prior werkt waar declaratie-data bestaat; ~half de live queue heeft dat → graceful fallback vereist).

## Opzet

- **Grondwaarheid:** `gold-set-oogstrun.json` (91 records, 75 ECHT / 16 VALS, mét GTIN + voorspelde
  code + menselijk label).
- **Live queue:** 400 open review-items (167 distinct GTINs) uit ACC-Postgres.
- **Declared-marks:** uit prod `application.tradeItems` via een server-side `$function`-walk over
  `packagingMarkingModule` (T3777) + `dietInformationModule` (dietTypeCode), geünioneerd per GTIN.
  Geverifieerde extractie; compacte output. Artefact: `tests/validation/declared-marks-goldset.json`.

## Resultaat 1 — gold-set (mét grondwaarheid): clean separatie

| | aantal | in declared set | out-of-set | waarvan op GTIN **zónder** declaratie |
|---|---:|---:|---:|---:|
| **ECHT** | 75 | **73 (97%)** | 2 | 2 |
| **VALS** | 16 | **0 (0%)** | 16 | 13 |

- **Geen enkele valse detectie is gedeclareerd** (VALS in-set = 0%) en **97% van de echte is
  gedeclareerd** → schone scheiding op het signaal zelf.
- **Onder de aanbevolen graceful fallback** (alleen flaggen als er een declaratie ís én de code
  out-of-set is) vangt de prior **3/16 valse detecties** — namelijk de 3 die op een GTIN mét declaratie
  zitten. De andere **13 valse zitten op GTINs zónder declaratie** → géén signaal (geen actie). Idem de
  2 ECHT-uitschieters (ook zonder declaratie) → die worden dus **niet** ten onrechte geflagd.
- **Precisie-lift op de records mét declaratie:** 96% → **100%**, met **0% recall-verlies**
  (73/73 ECHT behouden, 3/3 covered VALS verwijderd). Buiten die dekking: geen effect.
- ⚠️ Een eerdere lezing ("16/16 geflagd") telde *geen-declaratie* mee als out-of-set; dat zou flaggen-
  zonder-declaratie vereisen en botst met de fallback. De policy-consistente vangst is **3/16**.
  **Dekking — niet de 100% — is dus de bepalende variabele.**

**Asymmetrie (kernmechanisme):** "out-of-set" is een **sterk negatief** signaal (vrijwel alleen valse
detecties); "in-set" is een **zwakke bevestiging** (veelvoorkomende codes als RECYCLABLE/GREEN_DOT zijn
op veel GTINs gedeclareerd). De prior moet dus vooral als **auto-flag + re-ranker** werken, niet als
positief bewijs.

## Resultaat 2 — live queue (zonder labels, proxy): flagt de ruis

- **Dekking: ~54% van de queue-items heeft een bruikbare declaratie** (215/400; iets hóger, want de
  grouped-aggregatie raakte de 100-doc-cap — 106 GTINs hadden marks, 100 teruggegeven, dus ~6 GTINs
  met declaratie zijn als "geen declaratie" geteld). De rest: GTIN niet in prod óf geen mark-velden
  gevuld. → **Dit is de belangrijkste beperking; fallback is verplicht.**
- **In-set rate (alleen items mét declaratie): 26%** → 74% out-of-set. Onder hoog-conf (≥0,65):
  **65% out-of-set** → die zou de prior flaggen.
- **Kwalitatief sterk signaal:** vrijwel alle geflagde hoog-conf detecties zijn
  `RECYCLABLE_GENERAL_CLAIM @1.00` op GTINs die RECYCLABLE niet declareren — exact het
  degenerate-embedding-patroon uit Story 12.1. De prior vangt die valse 1.00-treffers.
  Voorbeeld: GTIN 08713788118363 → pred `RECYCLABLE@1.00`, declared = alleen `CERTIFIED_B_CORPORATION`.

## Interpretatie / go-no-go

- **GO.** Het mechanisme klopt: gedeclareerde waarden scheiden echt/vals schoon op de grondwaarheid
  (0% van de valse is gedeclareerd, 97% van de echte wél; recall behouden) en flaggen op de live queue
  precies de ruis (incl. de bekende RECYCLABLE@1.00-degeneraties) — **voor zover er declaratie is**.
- **Scope/limiet:** de prior helpt **waar declaratie-data bestaat** (~54% van de queue nu; hoger voor
  goed-onderhouden leveranciers). Voor de rest: **graceful fallback** = huidige gedrag, geen penalty.
- **Ontwerp-implicatie (bevestigt de story):** géén harde filter. Implementeer als:
  (1) **auto-flag** out-of-set detecties (sterk negatief signaal), (2) **re-rank/pin** declared codes in
  de picker, (3) **geen actie** als er geen declaratie is.

## Aandachtspunten voor Fase B (implementatie)

- **Datapad zonder VPN:** spike gebruikte de Mongo-MCP (alleen voor mij). De API-service heeft een
  programmatisch pad nodig naar prod `tradeItems` — bestaande catalog/tradeitemxml-API (X-API-Key) is de
  voorkeur (geen directe prod-Mongo-koppeling vanuit de app). Te bevestigen.
- **Per-GTIN cache** (TTL): declaraties wijzigen zelden; queue heeft veel herhaalde GTINs.
- **Common-code-ruis:** weeg "in-set" zwak (RECYCLABLE/GREEN_DOT/TRIMAN zijn bijna overal gedeclareerd);
  weeg "out-of-set" sterk. Eventueel idf-achtige weging per code-frequentie.
- **`isDietTypeMarkedOnPackage=TRUE`** als extra zekerheid voor diet-claims (staat écht als logo op pack).
- **Meet opnieuw op een schone eval** (12.6-dataset) zodra die er is; gold-set is oude-pipeline/4 klassen.

## Artefacten

- `tests/validation/declared-marks-goldset.json` — declared marks per gold-set-GTIN (spike-input).
- Analyse-scripts ad hoc (niet gecommit); reproduceerbaar via de `$function`-aggregatie in dit document.
