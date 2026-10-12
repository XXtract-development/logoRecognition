---
id: SPEC-stap1-localization-recall
companions:
  - meetplan.md
  - meetverslag.md
  - ontwerp.md
sources:
  - ../../implementation-artifacts/investigations/acc-top15-logoherkenning-slecht-20261012.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Afgeleid uit `.memlog.md`; niet met de hand bewerken.

# Stap 1 vindt meer zichtbare keurmerken op volledige etiketten

## Why

Pijn, gemeten op ACC (12-10-2026, versie f40a2a0, 186 geldige etiketten): van 140 gedeclareerde top-15-keurmerken vindt de pijplijn er 19. Bij 56 van 90 gemiste gevallen staat het logo zichtbaar op het etiket maar wijst stap 1 (lokalisatie) geen vakje aan dat het omvat; 46 etiketten krijgen nul voorstellen. Stap 1 is één vraag aan een visueel model op een tot 2400 px verkleind beeld, terwijl etiketten mediaan 4.400 px en soms 10.000+ px lang zijn (gestapelde aanzichten), zodat logo's na verkleining 20–75 px meten. Zolang stap 1 het logo niet aanwijst, kan geen verbetering in stap 2 het vinden. De productowner weegt weinig valse meldingen zwaarder dan meer vinden.

## Capabilities

- **CAP-1**
  - **intent:** Stap 1 levert op volledige etiketten vakjes die meer van de zichtbare, gedeclareerde keurmerken omvatten.
  - **success:** Op de 56 `niet_aangewezen`-gevallen omvat een vakje het logo in minstens 10 gevallen méér dan bij de huidige stap 1, gemiddeld over twee runs in dezelfde sessie (maat: `meetplan.md` §Dekking). De 19 gevonden gevallen blijven minstens zo vaak gedekt als bij de huidige stap 1. Nutri-Score-dekking apart gerapporteerd.
- **CAP-2**
  - **intent:** Het eindresultaat van de pijplijn vindt meer gedeclareerde keurmerken zonder meer valse meldingen.
  - **success:** Poort vóór merge — de proef (`meetplan.md` §Proef) met de huidige stap 1 als controle: gevonden gedeclareerde soorten stijgen, niet-gedeclareerde meldingen stijgen niet (0 extra), GHS en Nutri-Score dalen niet, mislukte scans niet meer dan bij de controle. Controle na merge (hoofdsessie): hermeting op de 186 etiketten met hetzelfde vergelijkingsscript geeft meer dan 19 van 140 top-15 en hoogstens 34 niet-gedeclareerde meldingen (≥ drempel), met hoogstens 3 mislukte scans.
- **CAP-3**
  - **intent:** Tijd en kosten van stap 1 per scan zijn zichtbaar en blijven binnen de grenzen.
  - **success:** In de proef: ml-deel max ≤ 165 s, scan max ≤ 240 s, 0 tijdsoverschrijdingen, foutpercentage per modelaanroep (o.a. 429) gerapporteerd; mediaan en p90 gerapporteerd. Na een geslaagde lokalisatie bewaart `logo_results.stap1` `aanroepen`, `tokensIn`, `tokensUit`, `overgeslagen` en `weggevallen`; na een mislukte lokalisatie ontbreken ze.
- **CAP-4**
  - **intent:** GHS en Nutri-Score houden hun huidige resultaat.
  - **success:** In de proef en de hermeting geen daling in gevonden GHS- en Nutri-Score-declaraties ten opzichte van de controle.
- **CAP-5**
  - **intent:** Een Nutri-Score-balk wordt niet als een andere letter gemeld wanneer alleen het vangnetmodel twijfelend een letter leest.
  - **success:** In de strikte route (pijplijn) claimt het Nutri-Score-vangnet alleen een letter bij een zekerheid van minstens de Nutri-Score-lat (0,99), dezelfde lat als de bestaande bevestigingsroute; daaronder geldt het bestaande pad "geen claim" (de onzekere embedding-uitkomst blijft het antwoord). Buiten de strikte route verandert niets. Nagespeeld op de 40-etiketten-proef: niet-gedeclareerde Nutri-Score-meldingen 18 → 1 over vier runs (`meetverslag.md`); de echte meting telt het "geen claim"-pad mee.
- **CAP-6**
  - **intent:** Eén ongeldig vakje in een modelantwoord laat de scan niet mislukken.
  - **success:** Een vakje met omgedraaide of samenvallende hoeken, of dat na knippen leeg is, wordt overgeslagen en geteld; de rest van het antwoord blijft staan. Dit geldt voor de huidige enkele aanroep en voor elke tegel. Andere ongeldige antwoorden (geen JSON, extra velden, afgekapt, verkeerd aantal) blijven een zichtbare fout.

## Constraints

- Valse meldingen wegen zwaarder dan meer vinden: een variant die meer vindt maar de niet-gedeclareerde meldingen laat stijgen, valt af.
- Unie van vakjes per scan max 64 (ml-service en API `MAX_CROPS`); boven 64 faalt de scan nu met een 503. Voorstellen en unie worden per constructie op ≤ 64 gehouden; 0 scans met een capaciteitsfout. Meer voorstellen mogen het tijdsbudget niet opblazen: verfijning stopt als er minder dan een reserve (min(30 s, 25% van het lokalisatiebudget)) rest.
- Tijd: ml-budget 165 s (validatie `le=165000`), scan 240 s; meerdere modelaanroepen lopen parallel binnen het bestaande lokalisatiebudget.
- Kosten (besluit productowner 12-10-2026): heel etiket plus tegels, hoogstens 6 aanroepen per scan (±5× modeltokens), is akkoord. Het plafond is instelbaar; 1 geeft het oude gedrag.
- Live alleen samen met de reparatie van de extra niet-gedeclareerde meldingen (besluit productowner): op de 40-etiketten-meting, twee runs, blijven de niet-gedeclareerde meldingen per run ≤ 4 (de controle met de huidige code); de huidige stap 1 mét reparatie wordt in dezelfde sessie meegemeten en gerapporteerd. Blijkt dat niet haalbaar, dan stopt het werk vóór de PR en gaan de gemeten getallen terug naar de productowner. Nagespeeld wordt dat verwacht (6 en 10 per run).
- Drempels van stap 2 worden niet bijgesteld op deze kleine steekproef (meetregel: niet bijstellen op kleine sets).
- De aanpak is gekozen op grond van een meting (`meetverslag.md`): heel etiket plus tegels; uitwerking in `ontwerp.md`.
- Foutcontract blijft: een mislukte modelaanroep geeft een zichtbare `fase`/`fout` in `stap1`, niet stil minder vakjes. Geen schema- of databasemigratie; `stap1` is vrije JSON naast `logoResults`.
- OpenRouter-sleutel bestaat alleen in de ACC-containers: nooit printen, loggen of opslaan. Klantbeelden blijven lokaal; een proef op ACC is klein en wordt opgeruimd.

## Non-goals

- Stap 2 (soortbepaling, referenties, drempels, poort) wijzigen, behalve de Nutri-Score-vangnetregel van CAP-5.
- Een getraind detectiemodel invoeren.
- De 80-megapixelgrens, de runner of de 429-limiet aanpassen.
- Uitrol, merge of de hermeting op ACC; dat doet de hoofdsessie.

## Success signal

- Na uitrol vindt de hermeting op dezelfde 186 etiketten meer dan 19 van de 140 top-15-declaraties met hoogstens 34 niet-gedeclareerde meldingen en hoogstens 3 mislukte scans, binnen de tijdslimiet, en `stap1` toont per scan aanroepen en tokens.

## Assumptions

- Het AI-oordeel over de 90 gemiste gevallen (`vooroordeel.json`) is voorlopig: 11 `niet_op_etiket`, 3 niet te beoordelen, 8 met lage zekerheid wachten op een mens (bron: onderzoek, sectie "Waar de gemiste top-15-logo's verloren gaan"). De dekkingsmaat gebruikt het oordeel als selectie, niet als waarheid over de positie.
- Logoposities voor de dekkingsmaat komen van AI-annoteerders met rasterzoom en eindcontrole; geen menselijke vakjes beschikbaar.
- De proef (stap 1 + de echte classify van de draaiende ml-service) voorspelt de hermeting via de API voldoende om tussen varianten te kiezen.

