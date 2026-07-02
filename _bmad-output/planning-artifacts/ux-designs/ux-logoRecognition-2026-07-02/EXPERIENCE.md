---
title: Vliegwiel-dashboard
status: final
created: 2026-07-02
updated: 2026-07-02
sources:
  - _bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md
---

# Vliegwiel-dashboard — Experience Spine

> Gekoppeld aan `DESIGN.md` (zelfde map): visuele tokens en componentspecs staan daar; dit document beschrijft de ervaring. Scope: vliegwiel-dashboard + quarantaine-afhandelflow + drempelbeheer + pauze (FR-17 t/m FR-19). Het reviewstation blijft ongewijzigd.

## Foundation

Desktop-first webinterface, ontworpen op 1280px+ — de datamanager werkt dit scherm vanaf een werkplek, niet onderweg. UI-systeem: **Ant Design 5 met XXtract-theming** via `ConfigProvider` (memlog-beslissing; de app draait al antd 5.22 + @ant-design/plots + react-router + zustand + i18next). Alle visuele waarden verwijzen naar DESIGN.md-tokens: pagina-achtergrond `{colors.app-bg}`, cards op `{colors.background}` met `{rounded.card}`, tekst `{colors.foreground}`, headings `{colors.foreground-heading}`, basis-typografie `{typography.body}`. Charts via @ant-design/plots: precisietrend = `Line` met batch-meetpunten, mismatch-trend = `Column`, promoties = gestapelde `Column` per klasse. Microcopy NL-only via i18next-keys.

## Information Architecture

Nieuwe route **`/flywheel`** binnen de bestaande SPA, als nav-item "Vliegwiel" in de `AppLayout`-header direct naast "Review" (`/artwork-review`) — het is functioneel de opvolger-werkplek van dezelfde datamanager. [ASSUMPTION: nav-icoon `sync`/`autorenew`; positie tussen Review en Dashboard in de bestaande menu-volgorde.]

| Surface | Bereikt via | Doel |
|---|---|---|
| Vliegwiel-overzicht (`/flywheel`) | Nav-item "Vliegwiel" | Gezondheid in één blik: KPI-rij, gold-set-precisietrend, quarantainebatches, klassen aan cap, outlier-meldingen, bootstrap-wachtrij, mismatch-trends, GLN-dekkingsgraad; pauzeschakelaar |
| Quarantainebatch-detail (`/flywheel/batches/:id`) | Rij "Openen" in de quarantainetabel | Master-detail-afhandelflow: kandidatenlijst links, bewijspaneel rechts; per kandidaat afkeuren/vrijgeven; batch afsluiten |
| Drempelbeheer (modal op overzicht) | Knop "Drempels" in de pagina-header | Promotiedrempel per methode aanpassen met verplichte reden |
| Pauze-bevestiging (modal) | Pauzeschakelaar | Vliegwiel pauzeren/hervatten met expliciete bevestiging |
| Batchhistorie (sectie op overzicht) | Tab/anker "Historie" | Gepasseerde en teruggedraaide batches; rollback-ingang (FR-4) |

Het overzicht is één scrollbare pagina met secties (geen tabs voor de kernsignalen — de journey UJ-1 is "alles in één blik"); alleen de batchhistorie zit achter een secundaire tab in de quarantaine-card. [ASSUMPTION: secties boven tabs, zodat geen enkel FR-17-signaal verborgen kan raken achter een niet-geopende tab.] Modals stapelen maximaal één niveau.

Alle acht FR-17-onderdelen hebben een vaste plek op het overzicht:

1. **Gold-set-precisietrend** — grootste card, linksboven onder de KPI-rij; één meetpunt per gepasseerde promotiebatch, regressie visueel herkenbaar (`{components.trend-chart}`); subregel toont gold-set-omvang en ECHT/VALS-verdeling (FR-11).
2. **Promoties per periode en per klasse** — KPI-tegel "Nieuwe referenties" + gestapelde kolomgrafiek per klasse in het rechterpaneel; "nieuw geactiveerde klasse" (UJ-2/FR-13) verschijnt hier als groene badge-regel.
3. **Batches in quarantaine met faalreden** — quarantainetabel (`{components.batch-table}`) direct onder de trend; kolommen: batch, datum, kandidaten, faalreden, status, actie "Openen".
4. **Klassen aan cap** — signaalpaneel rechts, lijst van T3777-codes met `cap-bereikt`-badge (amber) en aantal geweigerde nominaties (FR-6).
5. **Openstaande outlier-meldingen** — signaalpaneel rechts; per melding klasse + miniatuur-vergelijkingsbeeld, doorklik naar beoordeling (FR-8).
6. **Bootstrap-wachtrij** — paneel met klasse, declaratiefrequentie en status (wachtend/gedraaid/gevuld/uitgesloten), herordenen en uitsluiten door de datamanager (FR-13).
7. **Mismatch-trends** — kolomgrafiek bevestigd vs. gedeclareerd-niet-gevonden per periode, met per-klasse-verhouding en de export-ingang van het datakwaliteitsrapport (FR-14, FR-16).
8. **GLN-dekkingsgraad** — KPI-tegel + voortgangsbalk in het rechterpaneel: percentage archief-records met GLN, restant met uitvalreden (FR-21).

## Voice and Tone

Nederlands, nuchter, feitelijk. Het dashboard rapporteert een proces dat zichzelf bewaakt — de toon is die van een instrumentenpaneel, niet van een alarmcentrale. Quarantaine wordt consequent geformuleerd als **"wacht op jouw beoordeling"**, nooit als fout of falen.

| Do | Don't |
|---|---|
| "1 batch wacht op jouw beoordeling" | "1 batch GEFAALD!" |
| "Kwaliteitspoort: precisiedaling −1,8 pt boven tolerantie" | "Kritieke fout in batch" |
| "Vliegwiel gepauzeerd — hervatten kan hierboven" | "Systeem uitgeschakeld" |
| "Automatische stilstand na 2 opeenvolgende quarantaines" | "NOODSTOP geactiveerd 🚨" |
| "41 nieuwe referenties over 12 klassen" | "Geweldig weekend! 41 nieuwe referenties 🎉" |
| "Klasse aan cap: nominaties worden geweigerd (reden: cap-bereikt)" | "Limiet overschreden" |

Glossary-termen (PRD §3) worden exact gebruikt: kandidaat-referentie, promotiebatch, kwaliteitspoort, gold-set-regressietest, quarantaine, per-klasse cap, outlier-audit, seed-bootstrap, hard-negative, dubbele bevestiging, evidence-contract, informatieleverancier (GLN).

## Component Patterns

Gedrag; visuele specs in `DESIGN.md.Components`.

| Component | Waar | Gedragsregels |
|---|---|---|
| KPI-tegel (`{components.kpi-tile}`) | Overzicht, bovenaan | Klik navigeert naar de bijbehorende sectie (quarantaine-tegel → quarantainetabel). Waarden verversen bij paginabezoek; geen live-polling nodig. [ASSUMPTION: refresh on load + handmatige verversknop volstaat; het vliegwiel draait in batches, niet realtime.] |
| Batchtabel (`{components.batch-table}`) | Overzicht | Hele rij klikbaar → batch-detail; "Openen"-knop als expliciete affordance. Sorteren op datum (default nieuwste boven). Faalreden altijd als tekst zichtbaar, niet alleen als badge. Historie-tab toont gepasseerde batches met rollback-actie achter een bevestigingsmodal met verplicht redenveld (FR-4: wie/wanneer/waarom in het evidence-contract). |
| Bewijspaneel (`{components.evidence-panel}`) | Batch-detail | Toont per geselecteerde kandidaat: crop naast actieve referentie van dezelfde T3777-code, scoreblok (match-confidence vs. promotiedrempel), declaratieblok (GTIN, GLN, gedeclareerde codes met de gematchte code gemarkeerd), poort-uitkomsten per check. Beslissing (afkeuren/vrijgeven) selecteert automatisch de volgende onbeoordeelde kandidaat — kandidaat-voor-kandidaat-ritme zoals het reviewstation. |
| Kandidatenlijst | Batch-detail, links | Verticale lijst met miniatuur, T3777-code en statusbadge. Pijltjestoetsen en klik selecteren; beoordeelde kandidaten blijven zichtbaar met hun badge. Bovenaan batchvoortgang: "3 van 8 beoordeeld" + voortgangsbalk. |
| Batch afsluiten | Batch-detail, footer | Actief zodra alle kandidaten beoordeeld zijn. Samenvattingsmodal: N afgekeurd (worden hard-negative, FR-9), M vrijgegeven (vormen een nieuwe promotiebatch die opnieuw door de kwaliteitspoort gaat — vrijgave omzeilt de poort niet, FR-18). |
| Drempel-invoer (`{components.threshold-input}`) | Modal via "Drempels" | Per methode één `InputNumber`; opslaan vereist een ingevulde reden [ASSUMPTION: verplicht redenveld — FR-5 eist alleen logging van oude/nieuwe waarde; de reden maakt de audittrail bruikbaar]. Hint onder het veld: "Wijzigingen worden gelogd met oude en nieuwe waarde." Huidige én vorige waarde zichtbaar. |
| Pauzeschakelaar (`{components.pause-switch}`) | Overzicht, pagina-header | Omzetten opent altijd een bevestigingsmodal die de consequenties benoemt: "Nominatie en promotie stoppen; detectie en trainingsdata-registratie lopen door." Hervatten na automatische stilstand vereist dezelfde expliciete bevestiging (FR-19). |
| Outlier-beoordeling | Overzicht → melding | Melding opent vergelijkingsweergave (referentie vs. klasse-genoten); acties: "Behouden" of "Deactiveren" [ASSUMPTION: beoordelingsacties — FR-8 zegt alleen "markeert voor beoordeling"; de audit zelf deactiveert niets]. |
| Bootstrap-wachtrij | Overzicht, paneel | Herordenen via omhoog/omlaag-acties per rij; "Uitsluiten" met bevestiging (FR-13). Nul-resultaat-runs tonen status `leeg` en keren terug in de wachtrij (FR-12). |

## State Patterns

| State | Surface | Behandeling |
|---|---|---|
| Ladend | Overzicht | Skeleton-tegels en -tabelrijen in de verwachte layout (design system skeleton-patroon); geen spinner-op-wit. |
| Leeg (vers systeem) | Overzicht | Empty state per sectie met richting: "Nog geen promotiebatches — het vliegwiel nomineert bij de volgende verwerking." Geen kale vlakken. |
| Geen quarantaines | Quarantainetabel | Positieve empty state (groen icoon): "Alle batches passeerden de kwaliteitspoort." |
| Fout bij laden | Elke sectie | Sectie-lokale foutkaart met "Opnieuw proberen"; de rest van het dashboard blijft bruikbaar. |
| Gepauzeerd (handmatig) | Globaal op /flywheel | Amber banner (`{rounded.alert}`, `{colors.warning-light}`) onder de pagina-header: "Vliegwiel gepauzeerd door {naam} op {datum} — nominatie en promotie staan stil." Schakelaar toont Hervatten. |
| **Automatische stilstand** | Globaal op /flywheel, prominent | **Rode banner** (`{colors.destructive-light}`, icoon, bovenaan vóór alle content): "Automatische stilstand: 2 opeenvolgende promotiebatches in quarantaine. Hervatten kan na beoordeling." Links naar beide batches. Dit is (naast het regressie-meetpunt in de trend) de enige rode toestand in het hele scherm. |
| Batch in quarantaine | Overzicht + detail | Amber, "wacht op jouw beoordeling"; nooit rood (kleursemantiek DESIGN.md). |
| Rollback uitgevoerd | Historie | Neutrale badge `teruggedraaid` + toast-bevestiging; baseline-herstel als caption bij het trendpunt. |
| Verouderde data | Overzicht | Bij achtergrond-refresh met wijzigingen: rustige melding "Bijgewerkt — vernieuwen", handmatig, geen auto-reload. |

## Interaction Primitives

Muis-eerst met toetsenbord-versnelling in de afhandelflow — dezelfde spieren als het reviewstation (MobileReviewDeck-sneltoetsen):

- `A` — kandidaat **vrijgeven** (accepteren) [ASSUMPTION: hergebruik van de reviewstation-toewijzing A=accepteren voor consistent spiergeheugen]
- `R` — kandidaat **afkeuren** (wordt hard-negative)
- `U` — laatste beslissing op de huidige kandidaat ongedaan maken
- `←` / `→` — vorige / volgende kandidaat
- `Esc` — modal of paneel sluiten
- Sneltoetsen zijn inactief terwijl een invoerveld focus heeft (reviewstation-conventie); een compacte sneltoetsen-legenda staat in de detail-footer.

Op het overzicht: geen sneltoetsen nodig; klik en Tab volstaan. **Verboden:** hover-only affordances, infinite scroll (paginering in tabellen), modal-stapels dieper dan één niveau, beslisacties zonder zichtbare uitkomst (elke beslissing geeft directe badge-feedback op de kandidaat).

## Accessibility Floor

WCAG 2.1 AA, conform design system. Gedragsafspraken:

- Volledige toetsenbord-navigatie door de kandidatenlijst: pijltjestoetsen binnen de lijst, Tab tussen lijst, bewijspaneel en actieknoppen; de geselecteerde kandidaat krijgt `aria-selected` en wordt in beeld gescrold.
- Focus-states per DESIGN.md: rand `{colors.secondary}` + 3px zachte ring — zichtbaar op elk interactief element, ook op tabelrijen.
- Contrast per DESIGN.md-tokens: tekst minimaal 4.5:1; amber-tekst altijd `{colors.warning-text}` op `{colors.warning-light}` (niet `{colors.warning}` als tekstkleur).
- Status nooit via kleur alleen: badges combineren dot/icoon + tekst; het regressie-meetpunt in de trend krijgt naast rood ook een afwijkende marker-vorm en een tekstuele annotatie.
- Banners (pauze/stilstand) als `role="alert"` zodat schermlezers ze direct melden; beslissings-feedback via `aria-live="polite"`.
- Grafieken krijgen een tekstueel alternatief (laatste meting + delta als caption); de onderliggende data is als tabel opvraagbaar.

## Key Flows

### Flow 1 — Sanne's maandagochtend (UJ-1, FR-17/FR-18)

1. Sanne opent de app; nav-item "Vliegwiel" toont een badge met 1 openstaande quarantaine. Ze klikt.
2. Het overzicht laadt: KPI-rij toont gold-set-precisie **0,97** (stabiel), **41 nieuwe referenties** over **12 klassen** uit 3 promotiebatches dit weekend, **1 batch in quarantaine**, **2 klassen aan cap**, GLN-dekkingsgraad 91%.
3. De precisietrend toont drie nieuwe groene meetpunten op rij en één amber-geannoteerd punt bij de gequarantaineerde batch; de tolerantie-ondergrens is zichtbaar als stippellijn.
4. In de quarantainetabel staat de batch met faalreden "gold-set-regressietest: precisiedaling −1,8 pt". Ze klikt "Openen".
5. Batch-detail: kandidatenlijst links (8 kandidaten, allemaal `te beoordelen`), bewijspaneel rechts met de eerste kandidaat: crop naast referentie, match-confidence 0,94 tegen promotiedrempel 0,90, declaratieblok bevestigt de T3777-code, poort-uitkomsten tonen welke check blokkeerde.
6. Ze loopt kandidaat-voor-kandidaat door de batch met `→`, keurt er 3 af met `R` (verkeerd gelokaliseerde crops — direct zichtbaar in de vergelijking) en geeft de overige 5 vrij met `A`.
7. **Climax:** "Batch afsluiten" wordt actief. De samenvattingsmodal zegt: "3 afgekeurd → hard-negative; 5 vrijgegeven → nieuwe promotiebatch, gaat opnieuw door de kwaliteitspoort." Ze bevestigt. Terug op het overzicht is de quarantainetabel leeg met de positieve empty state — het hele incident kostte 10 minuten, en de poort had de schade al tegengehouden voordat zij er was.

Faalpad: het opslaan van een beslissing mislukt → toast "Beslissing niet opgeslagen — opnieuw proberen", de kandidaat behoudt `te beoordelen`, dezelfde toets herhaalt de actie.

### Flow 2 — De noodrem doet zijn werk (UJ-3, FR-19)

1. 's Nachts passeert een promotiebatch de guardrail-checks maar zakt de gold-set-regressietest onder de tolerantie: de batch gaat automatisch in quarantaine. Een tweede batch die nacht faalt ook → automatische stilstand (K=2).
2. Sanne opent 's ochtends het vliegwiel-overzicht. Bovenaan, vóór alle content, staat de rode stilstand-banner: "Automatische stilstand: 2 opeenvolgende promotiebatches in quarantaine." De pauzeschakelaar staat op "Gepauzeerd (automatisch)".
3. De precisietrend toont het rode regressie-meetpunt met annotatie; de rest van het dashboard is gewoon leesbaar — het vliegwiel draaide door voor alle andere klassen tot de stilstand, detectie en trainingsdata-registratie lopen gewoon door.
4. Ze opent de eerste batch vanuit de banner-link, ziet in het bewijspaneel de besmette kandidaat (verkeerd gelokaliseerde crop die toevallig matcht), keurt die af en handelt beide batches af zoals in Flow 1. De betrokken kandidaat-referenties zijn nooit actief geweest.
5. Vóór het hervatten besluit ze de aanvoer strakker te zetten: via "Drempels" opent ze het drempelbeheer, verhoogt de promotiedrempel voor embedding-matches van 0,90 naar 0,92 en vult de verplichte reden in ("twee besmette batches uit dezelfde importbron"). De hint bevestigt dat oude en nieuwe waarde gelogd worden (FR-5).
6. **Climax:** met beide batches afgehandeld klikt ze de schakelaar naar "Hervatten". De bevestigingsmodal vat samen wat er hervat wordt; ze bevestigt. De banner verdwijnt, de KPI-tegel kleurt terug naar neutraal — het systeem heeft zichzelf beschermd, en zij heeft het met twee beoordelingen, één drempelwijziging en één klik weer vrijgegeven.

Faalpad: ze hervat zonder de batches af te handelen — dat kan (de batches blijven veilig in quarantaine; niets ervan is actief), maar de modal waarschuwt: "2 batches wachten nog op jouw beoordeling." [ASSUMPTION: hervatten blokkeert niet op openstaande quarantaines; FR-19 eist alleen een expliciete actie.]

### Raakvlak — Nieuw geactiveerde klasse (UJ-2, FR-12/FR-13)

Geen eigen flow, wel een zichtbare landing: wanneer een seed-bootstrap een lege klasse van 0 naar ≥1 actieve referentie brengt, verschijnt in het promoties-paneel een groene regel "Nieuw geactiveerde klasse: DEMETER_LABEL — 4 referenties via seed-bootstrap", en verandert de status van die klasse in de bootstrap-wachtrij naar `gevuld`. Doorklik toont de gepromoveerde referenties met hun evidence-contract (herkomst: bootstrap). Sanne hoeft niets te doen — dat is precies het punt.
