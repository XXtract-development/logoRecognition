---
datum: 2026-08-20
auteur: Claude (feitenverzameling, uitsluitend repository-lezing)
aantal_stories: 16
---

# Reviewachterstand — 16 stories op `review`

> [!note] Wat dit document wel en niet is
> Uitsluitend feiten uit de repository (tak `acc`, `origin/acc` op `43db879`). Er is niets
> gewijzigd, gemeten op ACC, of gedeployed. De kolom "uitgerold" neemt letterlijk over wat het
> storyrecord of de sprint-statusregel zegt — er is zelf niets nagemeten op de omgeving.
> Story 20.20 valt buiten dit overzicht (vandaag gebouwd, blijft terecht op `review`).

**Uitkomst: 11 van de 16 kunnen op `done`, 5 niet.**

## Tabel

| # | Gebouwd (hash) | Op `acc` | Review (verdict, laatste ronde) | Uitgerold (letterlijk uit het record) | Wat ontbreekt | Aanbeveling |
|---|---|---|---|---|---|---|
| **19.16** | `46ddb93`, `da53484`, `a999dbf`, `71babde` | ja (alle 4) | `review-19-16-code-v2.md` — `verdict: PASS` / `deploy_gate: PASS` / `story_done_gate: FAIL` op N1. Vier spec-ronden (`review-19-16.md` t/m `-v4-delta.md`) + twee code-ronden. N1 verwerkt in `a999dbf` mét RED-bewijs; geen bevestigende derde ronde. | "Het herbouwen van de live index op ACC valt BUITEN deze story (aparte schrijfactie, expliciete toestemming Friso)" (`19-16…md:44`). Die herbouw is op 2026-08-19 alsnog uitgevoerd, onder 20.19: `e3e476f` "the live index is rebuilt — 1082 products, 90 keys". | Task 10a staat onafgevinkt: "`- [ ] 10a. **Redis-voetafdruk controleren** vóór de verificatierun`". | **done** |
| **20.1** | `4ad3790`, `9f9acfd` | ja | Géén `review-20-1*.md` gevonden. Storyrecord: "**Adversariële review PASS** … 2 van 3 LOWs direct verwerkt" (`20-1…md:55`). | Geseed op ACC mét Friso's akkoord, rebuild 256 refs/0 fouten, DB-verificatie 12/12 actief (`20-1…md:54`). | Eigen done-voorwaarde: "Status → review; **done-flip na sampler-run 20.2 of eerdere bevestiging**" — 20.2 staat op `superseded`, dus die route bestaat niet meer. Los daarvan: "Open follow-up (buiten scope, voorstel aan Friso): bron-route voor de 3 alcohol-waarschuwingen". | **done** (de "eerdere bevestiging" is nu de enige route) |
| **20.3** | `f1d077c` | ja | Géén `review-20-3*.md`. Record: "Adversariële review verdict FAIL → **alle bevindingen verwerkt**" (H1/M2/L3, +3 regressietests, 7/7). Geen her-review. | "Deploy permission-gated." | Geen openstaand acceptatiecriterium. Reviewbestand ontbreekt op schijf. | **done** |
| **20.4** | `ce67b03` | ja | Géén `review-20-4*.md`. Record: "Adversariële review **PASS** (10 eigen probes …) met 1 MEDIUM verwerkt" (undo-kaping + regressietest). | "Deploy permission-gated." | Geen openstaand acceptatiecriterium; één LOW bewust geaccepteerd ("staged code overleeft navigatie … knop toont dat eerlijk"). | **done** |
| **20.5** | `7b3cda1` | ja | Géén `review-20-5*.md`. Record: "Adversariële review **PASS** … 1 verbetering doorgevoerd uit review-6". | "Deploy permission-gated." | Geen openstaand acceptatiecriterium; rest INFO/LOW en pre-existing. | **done** |
| **20.6** | `981f69a` | ja | **Géén afgeronde review.** Record: "(Adversariële review **gestart maar door de gebruiker onderbroken**; de HIGH-risico-aanname — updatedAt-bump — is handmatig geverifieerd.)" (`20-6…md:47`). | "Deploy permission-gated." | Het tweede reviewmoment op de diff ontbreekt volledig. | **blijft review**, want de code review is nooit afgemaakt |
| **20.7** | `f02d9e9` | ja | Géén `review-20-7*.md`. Record: "Adversariële review **PASS** met 2 MEDIUM verwerkt" (M1 embedding-gevoelige fake + mutatietest, M2 eerlijke AC3 + env-ontsnappingsklep). | "Deploy = permission-gated; profiteert de eerstvolgende oogst-ronde." | "Geen ACC-run in deze story (code+tests → review)" (`20-7…md:38`) — bewust zo afgebakend. | **done** |
| **20.8** | `171fdfc`, `020f9df` | ja (beide) | Géén `review-20-8*.md`. Record: "Adversariële review **PASS**", F2 traversal-guard + F3 sharp-normalisatie verwerkt. | "2026-07-21: **LIVE + geverifieerd** … Endpoint-verificatie op ACC: BDIH_LOGO/ICADA → 200 `guide-example`, GREEN_DOT → 200 `reference`, SOCIETY_PLASTICS_INDUSTRY → 404 → frontend-placeholder. Feature volledig werkend." | Optioneel restpunt: "~73 codes hebben alleen vector-art (WMF …); die tonen de placeholder. Follow-up-optie: WMF→PNG-conversie." | **done** |
| **20.9** | `672edcf` | ja | Géén `review-20-9*.md`. Record: "Verdict **PASS** (0 HIGH)", 1 MEDIUM als bekend risico vastgelegd. | "Deploy = permission-gated; raakt alleen toekomstige oogst-runs, niet de live-app." | Operationele poort, niet gebouwd werk: "**VALIDATIE-POORT (verplicht vóór elke BREDE oogst-run):** eerst een DRY-RUN draaien en `skipped_keyline` inspecteren". | **done** |
| **20.11** | `87fea96`, `3168840` | ja (beide) | Twee ronden, beide op schijf: spec `review-20-11.md` (FAIL, 3 high) → herzien; code `review-20-11-code.md` (**FAIL**, 2 high) → geremedieerd in `3168840` mét RED-bewijs. Geen bevestigende her-review. | Sprint-status: "2026-07-27 GEBOUWD+**UITGEROLD** (`87fea96`)". | De uitrol wordt op `87fea96` geclaimd; of de livelock-fix `3168840` óók is uitgerold staat nergens vastgelegd. | **done** |
| **20.12** | `6ec4a87` | ja | `review-20-12-code.md` (toegevoegd 2026-08-17 in `9da6c5f`) — **FAIL, 2 high / 3 medium / 5 low**. Geen commit ná dat bestand verwijst ernaar; het storyrecord eindigt op 2026-07-27 en is niet bijgewerkt. | Sprint-status: "GEBOUWD+**UITGEROLD** (`6ec4a87`)". | Sprint-status zelf: "**LET OP: AC2 (hoogte) is NIET gehaald**". Review H1: "AC2 is niet gehaald: een derde hoogtebegrenzing maakt de prop een dode letter". Restpunt in het record: "visuele controle op ACC na deploy (AC1/AC2 in de praktijk)". | **blijft review**, want AC2 is niet gehaald en de FAIL-bevindingen zijn nergens verwerkt |
| **20.13** | `a114ea4` | ja | `review-20-13-code.md` (2026-08-17) — **PASS-met-voorbehoud**, 0 high / 4 medium / 5 low. Geen enkele bevinding aantoonbaar verwerkt; geen commit of recordregel ná 2026-07-27. | Sprint-status: "GEBOUWD+**UITGEROLD** (`a114ea4`)". | Record: "**Resteert**: ACC-verificatie ná deploy dat de 9 gemeten codes het gidslogo tonen (AC2, task 4)". Review: "Punt 3 [M2] vraagt een beslissing van Friso en **blokkeert `done`**, niet de deploy." | **blijft review**, want M2 is een openstaande productvraag en AC2/task 4 is niet geverifieerd |
| **20.14** | `23592d4` | ja | `review-20-14-code.md` (2026-08-17) — **FAIL, 2 high / 4 medium / 5 low**. Geen commit of recordregel die de bevindingen verwerkt. | Sprint-status: "GEBOUWD+**UITGEROLD** (`23592d4`)". | Review H1: de actieknoppen vallen buiten de gemeten kaart, "dit is een **regressie**". H2: "`maxHeight: '100%'` begrenst niets". Record: "De visuele bevestiging … gebeurt op ACC na uitrol". | **blijft review**, want een FAIL met twee highs staat onverwerkt |
| **20.15** | `9da6c5f` | ja | `review-20-15-code.md` — **FAIL, 3 high / 6 medium / 5 low**; alle bevindingen verwerkt in diezelfde commit (nulmeting bijgesteld naar 490/190 px). Geen bevestigende her-review. | Testinfrastructuur, geen productiecode; niets uitgerold. | Record: "**AC6 is daarmee wel gehaald voor CI en niet voor een verse machine** zonder die eenmalige installatie" — `npx playwright install chromium` "is een download en is dus niet zonder toestemming gedaan". | **blijft review**, want AC6 is niet gehaald op een verse machine (permission-gated download) |
| **20.16** | `7711900`, `4723af5`, `5e29c05` | ja (alle 3) | Drie ronden op schijf: spec `review-20-16.md` (FAIL, 3 high) → herschreven; code `review-20-16-code.md` (FAIL, 2 high/6 medium) → verwerkt; her-review `review-20-16-code-v2.md` — **FAIL** (0 high; 3 medium deels, 3 low, 3 nieuw), verwerkt in `4723af5`. Geen vierde ronde. | Record `20-16…md:341`: "**Live-controle door Friso (2026-08-18)** … Gecontroleerd op ACC" → alle bediening in beeld, beeld niet afgekapt. Eén bevinding (kale icoonknop) verwerkt in `5e29c05`. | Eerlijk gemeld in het record: "voor de tekenzone-grens **ONTBREEKT sluitend faalbewijs**" — drie pogingen bleven groen omdat de zone nu gecentreerd is; het gedrag is wel dubbel afgedekt. | **done** |
| **20.17** | `7711900`, `4723af5` | ja (beide) | Drie ronden: spec `review-20-17.md` (FAIL, 2 high) → herschreven; code `review-20-17-code.md` (FAIL, 1 high/4 medium) → verwerkt; her-review `review-20-17-code-v2.md` — **FAIL** ("uitsluitend van de boekhouding"), verwerkt in `4723af5`: "all four findings confirmed processed, each verified by mutation" + 3 nieuwe. Geen vierde ronde. | Meegenomen in Friso's ACC-controle van 2026-08-18: "Scherper contextbeeld (20.17) — correct". | Bekend risico, niet weggedefinieerd: "de geheugenpiek zit in het decoderen van het volledige artwork (~36 MB), niet in de uitvoer". | **done** |

## De vijf die niet op `done` kunnen

**20.6 — het tweede reviewmoment ontbreekt volledig.** Het storyrecord zegt zelf dat de
adversariële review "gestart maar door de gebruiker onderbroken" is; alleen de dragende aanname
(de `updatedAt`-bump) is handmatig geverifieerd, de rest van de diff is nooit tegengelezen.

**20.12 — AC2 is aantoonbaar niet gehaald.** De sprint-statusregel en de code-review zeggen
hetzelfde: het `maxHeight`-doorgeven is een dode letter zolang de ouder het beeld op `48vh`/`440 px`
klemt, en de FAIL-bevindingen van 2026-08-17 zijn nergens verwerkt.

**20.13 — er ligt een productvraag bij Friso.** De review zelf noemt M2 (of het
promotie-quarantaine-paneel dezelfde herkomst-rangorde wil) het enige echte beslispunt en zegt
letterlijk dat het `done` blokkeert; daarnaast staat de ACC-verificatie van de 9 gemeten codes nog open.

**20.14 — een FAIL met twee highs staat onverwerkt.** De review meet dat de actieknoppen sinds
deze story buiten de gemeten kaart vallen (een regressie ten opzichte van vóór 20.14) en dat de
beeldbegrenzing niets begrenst; er is geen commit of recordregel die daarop antwoordt.

**20.15 — AC6 is half gehaald en de rest is permission-gated.** Het storyrecord meldt zelf dat de
browsertest in CI werkt maar op een verse machine niet, omdat de benodigde
`npx playwright install chromium` een download is die niet zonder toestemming is gedaan.

> [!warning] Eén observatie over de administratie, niet over de techniek
> Voor acht van de zestien stories (20.1, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9) bestaat er
> géén `review-<nummer>*.md` op schijf. Zeven ervan dragen wél een uitgeschreven reviewverdict in
> het storyrecord zelf; alleen bij 20.6 is er werkelijk niet gereviewd. Omgekeerd zegt de
> sprint-statusregel bij 20.12, 20.13 en 20.14 nog steeds "CODE-REVIEW ONTBREEKT", terwijl die
> drie reviews op 2026-08-17 wél zijn geschreven (`9da6c5f`) — met FAIL, FAIL en
> PASS-met-voorbehoud. Die regel is dus verouderd in beide richtingen.
