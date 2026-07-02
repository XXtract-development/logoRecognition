# PRD Quality Review — Referentie-vliegwiel zonder review

## Overall verdict

Dit is een sterk, beslisrijp PRD met een heldere these (elke dubbel bevestigde detectie wordt brandstof voor betere herkenning) waaruit alle features, de MVP-volgorde en de metrics aantoonbaar volgen; de guardrails zijn geen bijzaak maar dragend, en de scope-eerlijkheid (13 geïndexeerde aannames, expliciete Non-Goals, beargumenteerde deferrals) is voorbeeldig. Het risico zit in een handvol ongebonden formuleringen in de FR's die downstream story-creatie zullen raken — met name de trap-2-dedupdrempel (FR-7), het outlier-criterium (FR-8) en de bootstrap-drempel (FR-12), waarvan de kwantificering nu alleen in het addendum of nergens staat. Geen enkele bevinding is critical of high; het PRD kan met kleine aanscherpingen door naar architectuur.

## Decision-readiness — strong

Keuzes worden als keuzes gesteld, niet als "overwegingen": "Er bestaat géén pad van detectie rechtstreeks naar actieve referentie" (§4.1), fail-closed als harde regel (§Cross-Cutting NFRs: "nooit 'bij twijfel door'"), en de MVP-deferral van de seed-bootstrap is expliciet beargumenteerd ("vereist een werkende promotielus als fundament", §6.2) inclusief een `[NOTE FOR PM]` op precies de plek waar de spanning zit ("emotioneel load-bearing — de 15+ lege klassen waren de oorspronkelijke aanleiding"). De Open Questions (§8) zijn echt open — OQ-1 (regressietest-methodiek bij 91 samples) en OQ-3 (GLN-route met governance-implicaties) hebben geen verstopt antwoord. Counter-metrics (SM-C1: "sturen op volume nodigt uit tot drempelverlaging en dat is precies de faalwijze") tonen dat de auteur zijn eigen faalmodus kent.

Eén kanttekening: de verworpen alternatieven — het sterkste bewijs dat er écht gekozen is — staan uitsluitend in addendum §3. Een beslisser die alleen prd.md leest, ziet bij FR-2 wél de batch-als-eenheid-keuze maar niet waarom "direct promoveren" verworpen is.

### Findings
- **low** Afwegingen achter kernkeuzes alleen in addendum (§4.1/FR-2 vs. addendum §3) — de rationale "één besmette referentie kan het systeem laten omvallen; de batch maakt rollback en meting betaalbaar" is beslissingsdragend maar staat niet in het PRD zelf. *Fix:* per kernkeuze één zin rationale in de feature-description, of een expliciete verwijzing "afgewezen alternatieven: zie addendum §3" in §0 of §4.1.

## Substance over theater — strong

Geen meubilair aangetroffen. §2 gebruikt Jobs To Be Done in plaats van persona-theater, met een expliciete Non-Users-lijst (§2.2) die daadwerkelijk scope afbakent. De Vision (§1) is onverwisselbaar met een ander product: hij benoemt het concrete lek ("dubbel bevestigde crops verdwijnen nu in de trainingsdata-opslag en doen daarna niets meer"), het eigen incident (RECYCLABLE) en het industriële precedent. De Cross-Cutting NFRs zijn productspecifiek in plaats van boilerplate — "Idempotentie: herverwerking van dezelfde GTIN … leidt niet tot dubbele nominaties" is een echte eis, geen "systeem moet betrouwbaar zijn". "Why Now" is verdiend met drie concrete, verifieerbare lijnen (bouwstenen 8.5/8.6/12.4/12.7/12.8, n8n-aanvoer 100–200/dag, ECGT-deadline 27-09-2026).

## Strategic coherence — strong

Het PRD heeft een expliciete these en wedt erop: het vliegwiel-patroon met guardrails als kern van het ontwerp, niet als bijzaak (§1: "guardrails die geen bijzaak zijn maar de kern van het ontwerp"). Alle zeven features dienen die ene lus — nominatie (§4.1), verdediging (§4.2), meetinstrument (§4.3), koude start (§4.4), brandstof (§4.5, §4.7), besturing (§4.6) — niets leest als losse backlog-wens. De MVP-scope-logica volgt de these in plaats van "wat makkelijk is eerst": bootstrap eruit omdat hij de lus als fundament nodig heeft, GLN-backfill eruit omdat hij onafhankelijk is. SM-1 als "bestaansvoorwaarde" valideert de these direct, en de counter-metrics zijn precies goed gekozen.

### Findings
- **medium** SM-3 (bevestigingsgraad stijgt maand-op-maand) heeft een attributieprobleem (§7) — de CONFIRMED-ratio kan stijgen of dalen door verschuiving in de productmix (de n8n-aanvoer start juist in dezelfde periode), los van referentiekwaliteit. Het PRD claimt hiermee "valideert de vliegwiel-hypothese als geheel" zonder controle voor die verstorende factor. *Fix:* SM-3 normaliseren (bijv. bevestigingsgraad per klasse, of gemeten op een vast cohort/de gold-set-declaraties) of expliciet markeren als indicatieve, niet-causale metric.

## Done-ness clarity — adequate

De basis is uitstekend: alle 21 FR's hebben expliciete "Consequences (testable)", en de meeste grenzen zijn numeriek vastgelegd via getagde aannames (tolerantie 1 procentpunt bij FR-3, drempel 0,90 bij FR-5, cap 10 bij FR-6, K=2 bij FR-19, N=10/M=5 bij FR-15). Consequences als "Een detectie zónder declaratie-bevestiging resulteert nooit in een kandidaat-referentie" (FR-1) zijn direct omzetbaar naar acceptatietests. Maar deze dimensie moet onvergeeflijk beoordeeld worden, en een handvol FR's laat de bound weg die story-creatie nodig heeft — telkens op plekken waar het addendum wél een kandidaat-waarde kent of waar er helemaal geen staat.

### Findings
- **medium** FR-7 trap-2 zonder drempel (§4.2) — "visueel-gelijkende varianten" en "visueel vrijwel samenvalt" zijn geen testbare grenzen; de kandidaat-waarde (embedding-cosine ~0,97) staat alleen in addendum §1. *Fix:* startwaarde als `[ASSUMPTION]` in FR-7 opnemen, analoog aan hoe FR-5 en FR-6 het doen.
- **medium** FR-8 outlier-criterium ongedefinieerd (§4.2) — "ver van zijn klasse-centrum" heeft geen criterium; het addendum noemt "top-percentiel markeren" zonder getal. Een engineer weet niet wanneer een referentie een outlier ís. *Fix:* startcriterium als `[ASSUMPTION]` (bijv. "afstand > Pxx-percentiel van de klasse" met concrete waarde).
- **medium** FR-12 bootstrap-drempel alleen kwalitatief (§4.4) — "strenger dan de reguliere promotiedrempel" geeft richting maar geen waarde, en "alleen ondubbelzinnige vondsten" in de feature-description is ongedefinieerd. *Fix:* concrete startwaarde als `[ASSUMPTION]` (bijv. 0,93) en "ondubbelzinnig" operationaliseren of schrappen.
- **low** FR-21 "meetbaar gestegen" is geen bound (§4.7) — de consequence "het percentage artwork-records mét GLN is meetbaar gestegen" is bij +0,1% al waar. *Fix:* richtwaarde dekkingsgraad opnemen (desnoods als aanname), of expliciet stellen dat de doelwaarde een architectuur-/operationele keuze is.

## Scope honesty — strong

Dit is de sterkste dimensie. De Non-Goals-sectie (§5) doet echt werk — zes omissies die anders stilzwijgend aangenomen zouden worden (geen hertraining, geen leverancier-communicatie, geen 39k-bulk-run) zijn expliciet, elk met de reden erbij. Dertien `[ASSUMPTION]`-tags staan inline op precies de inferenties die de gebruiker niet bevestigd heeft (cadans, drempels, caps, K, N/M), geïndexeerd in §9. De MVP-deferral is geen stille de-scoping maar een beargumenteerd voorstel met `[NOTE FOR PM]` op het pijnpunt. De open-items-dichtheid (6 Open Questions + 13 aannames + 1 PM-note) is hoog maar past bij de aard van het document: vrijwel alle aannames zijn kalibratiewaarden die pas in de eerste draai-weken echt vast te stellen zijn — dat is eerlijkheid, geen onafheid. Het risico "Gold-set te dun" wordt niet weggemoffeld maar krijgt kans "Hoog (bij start)" in de risicotabel.

## Downstream usability — strong

Dit PRD is expliciet chain-top (§0: "de architect en de ontwikkelaars die de epics en stories uitwerken") en is daarop ingericht. De Glossary (§3) is uitzonderlijk compleet — 24 termen, inclusief de statuswaarden (`candidate`/`verified`) en de twee mismatch-typen — en wordt consistent gebruikt door alle FR's, UJ's en SM's heen. FR-1 t/m FR-21 zijn contigu en uniek; kruisverwijzingen resolven (FR-15→FR-13, FR-18→FR-9, FR-16→FR-5, risicotabel→OQ-1). De addendum-scheiding ("Technische kandidaat-oplossingen staan bewust niet hier", §0) houdt het PRD source-extractbaar zonder architectuurkeuzes voor te sorteren, terwijl het addendum per FR wél de kandidaat-techniek klaarzet voor `bmad-architecture`. Kleine gaten (promotiedrempel/bootstrap-drempel niet in de Glossary; UJ-2/UJ-3 zonder protagonist) staan in de Mechanical notes — ze halen de dimensie niet omlaag.

## Shape fit — strong

De vorm is bewust gekozen en klopt: §2.3 verklaart zelf "Lichte vorm — intern tool, één operator-rol", en het document gedraagt zich daarnaar — capability-spec met drie dunne maar concrete journeys in plaats van UJ-dichtheid, en operationele SM's (afhandeltermijnen, dekkingsgroei) in plaats van geforceerde user-facing metrics. Als brownfield-PRD zijn de verwijzingen naar bestaande code specifiek en controleerbaar (Story 8.5 crosscheck, 8.6 provenance, 12.4 gate-v2, 12.6 harvest, 12.8 kruischeck ready-for-dev), met per FR de afbakening wat ongewijzigd blijft ("De bestaande trainingsdata-registratie (Story 8.6) blijft byte-voor-byte ongewijzigd functioneren", FR-1). De afhankelijkheid van het nog niet gebouwde 12.8-endpoint is eerlijk gemarkeerd inclusief terugvalgedrag ("het vliegwiel werkt ook zonder", §Integration). Geen over- of onderformalisering.

## Mechanical notes

- **Assumptions Index roundtrip — één samengevouwen entry.** FR-21 heeft een inline `[ASSUMPTION: primair via batch-backfill uit de tradeItems-bron…]` die in §9 niet als eigen regel staat; de index-entry "§4.7 — 39k-bulk-verwerking zelf buiten scope; GLN-route is architectuurkeuze" dekt twee verschillende inline tags (de §4.7-description-aanname én de FR-21-aanname). Splitsen in twee regels maakt de roundtrip sluitend. Ook §4.3 FR-11 bevat twee inline tags die in §9 als één entry samengevoegd zijn — hier wel met alle inhoud behouden.
- **Glossary-gaten:** *promotiedrempel* (FR-5) en *bootstrap-drempel* (FR-12) zijn dragende termen die niet in §3 staan; beide worden wel elders aangehaald (FR-16 "boven de promotiedrempel (FR-5)"). Toevoegen kost twee regels.
- **UJ-protagonisten:** UJ-1 heeft Sanne; UJ-2 ("Het systeem vult een lege klasse") en UJ-3 ("De noodrem doet zijn werk") hebben geen dragende protagonist — verdedigbaar bij de gekozen lichte vorm, maar UJ-2 en UJ-3 zijn feitelijk systeemscenario's, geen user journeys.
- **ID-notatie:** de risicotabel verwijst naar "OQ-1" terwijl §8 een genummerde lijst zonder OQ-prefix is; resolvet wel, maar consistente labels (OQ-1 t/m OQ-6 in §8) zijn netter voor downstream extractie.
- Secties, front-matter en kruisverwijzingen naar bestaande documenten (bestaande PRD, research-rapport) zijn aanwezig en consistent; geen gebroken interne verwijzingen aangetroffen.
