---
id: SPEC-stap1-localization-recall
companions:
  - meetplan.md
  - meetverslag.md   # volgt na de meting
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
  - **success:** In de proef: ml-deel max ≤ 165 s, scan max ≤ 240 s, 0 tijdsoverschrijdingen; mediaan en p90 gerapporteerd. Per scan bewaart `logo_results.stap1` de velden `aanroepen`, `tokensIn` en `tokensUit` (ook bij een mislukte scan, zover bekend).
- **CAP-4**
  - **intent:** GHS en Nutri-Score houden hun huidige resultaat.
  - **success:** In de proef en de hermeting geen daling in gevonden GHS- en Nutri-Score-declaraties ten opzichte van de controle.

## Constraints

- Valse meldingen wegen zwaarder dan meer vinden: een variant die meer vindt maar de niet-gedeclareerde meldingen laat stijgen, valt af.
- Unie van vakjes per scan max 64 (ml-service en API `MAX_CROPS`); boven 64 faalt de scan nu met een 503. Elke variant houdt de unie per constructie op ≤ 64; 0 scans met een capaciteitsfout.
- Tijd: ml-budget 165 s (validatie `le=165000`), scan 240 s; meerdere modelaanroepen lopen parallel binnen het bestaande lokalisatiebudget.
- Kosten: meer modelaanroepen per scan dan nu (één) is een productkeuze. Voorlopig plafond: hoogstens 6 aanroepen per scan. De bouw is klaar voor review zodra het meetverslag compleet is; uitrol wacht bij meerkosten op de beslissing van de productowner.
- De aanpak wordt gekozen op grond van een meting van varianten (`meetverslag.md`), niet vooraf.
- Foutcontract blijft: een mislukte modelaanroep geeft een zichtbare `fase`/`fout` in `stap1`, niet stil minder vakjes. Geen schema- of databasemigratie; `stap1` is vrije JSON naast `logoResults`.
- OpenRouter-sleutel bestaat alleen in de ACC-containers: nooit printen, loggen of opslaan. Klantbeelden blijven lokaal; een proef op ACC is klein en wordt opgeruimd.

## Non-goals

- Stap 2 (soortbepaling, referenties, drempels, poort) wijzigen.
- Een getraind detectiemodel invoeren.
- De 80-megapixelgrens, de runner of de 429-limiet aanpassen.
- Uitrol, merge of de hermeting op ACC; dat doet de hoofdsessie.

## Success signal

- Na uitrol vindt de hermeting op dezelfde 186 etiketten meer dan 19 van de 140 top-15-declaraties met hoogstens 34 niet-gedeclareerde meldingen en hoogstens 3 mislukte scans, binnen de tijdslimiet, en `stap1` toont per scan aanroepen en tokens.

## Assumptions

- Het AI-oordeel over de 90 gemiste gevallen (`vooroordeel.json`) is voorlopig: 11 `niet_op_etiket`, 3 niet te beoordelen, 8 met lage zekerheid wachten op een mens (bron: onderzoek, sectie "Waar de gemiste top-15-logo's verloren gaan"). De dekkingsmaat gebruikt het oordeel als selectie, niet als waarheid over de positie.
- Logoposities voor de dekkingsmaat komen van AI-annoteerders met rasterzoom en eindcontrole; geen menselijke vakjes beschikbaar.
- De proef (stap 1 + de echte classify van de draaiende ml-service) voorspelt de hermeting via de API voldoende om tussen varianten te kiezen.

## Open Questions

- Mag stap 1 per scan meer dan één modelaanroep doen, en tot welke kosten per scan? (beslissing productowner; getallen in `meetverslag.md`)
