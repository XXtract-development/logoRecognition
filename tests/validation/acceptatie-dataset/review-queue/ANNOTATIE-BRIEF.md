# Annotatie-brief — keurmerk acceptatie-dataset (Story 12.6)

**Voor:** Product Owner / aangewezen annotator · **Tijd:** ~30–60 min voor de eerste ronde.

## Waarom
Het herkenningsmodel kan pas verbeterd en getoetst worden met **échte, menselijk bevestigde**
keurmerk-crops. Die data bestaat nog nauwelijks (4 klassen). Jouw labels ontgrendelen de volgende
trainingsronde (12.3) en de endpoint-acceptatietest (12.5).

## Wat te doen
1. Open **`annotate.html`** in een browser (dubbelklik; de `crops/`-map moet ernaast staan — staat in
   dezelfde map).
2. Per crop bepaal je: toont dit écht het genoemde keurmerk?
   - **ECHT** = ja, het juiste keurmerk-logo staat op de crop.
   - **VALS** = nee: geen keurmerk, of een ánder keurmerk dan de titel.
3. **Bedienen:** klik een crop — 1× = ECHT (groen), 2× = VALS (rood), 3× = leeg. Of: muis op de crop +
   toets **E** (echt) / **V** (vals). Voortgang wordt automatisch lokaal bewaard (localStorage).
   - **Tussentijds opslaan (aanbevolen op iPhone):** klik **"Tussentijds opslaan"** → downloadt een klein
     `voortgang.json`. Bewaar dat. Later/op een ander apparaat: open de pagina, klik **"Laden"**, kies dat
     bestand → je gaat verder waar je was. Zo ben je niet afhankelijk van de browser-opslag.
4. **Volgorde:** begin per code bovenaan — die zijn op confidence gesorteerd, dus de **hoogste kans op
   ECHT staat boven** (groen = ≥0,75). De meeste lage crops zijn VALS → snel afwijzen.
5. **Doel:** **≥15 ECHT per code**. De balk bovenaan telt mee hoeveel codes het doel halen.
6. Klik **"Exporteer dataset-v1.json"** → lever dat bestand in (of leg het in
   `tests/validation/acceptatie-dataset/`).

## Belangrijk
- **Bij twijfel: VALS.** Liever een echte missen dan een valse binnenlaten — precisie van de set telt zwaar.
- Sommige codes hebben weinig hoog-conf kandidaten; haal je de 15 niet, label dan wat er is — een tweede
  assembler-ronde over meer artwork kan aanvullen.
- De bbox is automatisch (ruim); voor déze stap hoeft die niet exact (crop accept/reject volstaat voor de
  embedding-training). Strak bijsnijden komt later (detector-story 12.4).

## Wat er daarna gebeurt
`dataset-v1.json` wordt bevroren, uitgesloten van training (anti-leakage), en gebruikt als (a) realistische
positieven voor fine-tuning-iteratie 2 en (b) de echte eval-set voor de endpoint-norm.
