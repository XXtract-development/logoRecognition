# Spike 12.21: Herkenningsmechanisme voor Nutri-Score (embedding vs. purpose-built)

Status: done (spike — onderzoek afgerond; deliverable = go/no-go + blauwdruk)

<!-- Aanleiding: na 12.15-oogst hebben C/D elk 11 actieve referenties met embeddings
     (teller-drempel/conditie C gehaald). Friso vroeg om de beste route te bepalen
     nadat een live held-out test liet zien dat de herkenning de letters slecht
     onderscheidt. "Neem de beste route" (2026-07-14) → dit spike-verdict. -->

## Vraag

Werkt de bestaande **embedding + nearest-reference**-aanpak (efficientnet_b0 →
pgvector cosine tegen de actieve `NUTRISCORE_A..E`-referenties) betrouwbaar voor
Nutri-Score — voor (a) **open** letter-herkenning, (b) **declaratie-verificatie**
(kruischeck), en (c) loutere **aanwezigheid** ("staat er een Nutri-Score op")? En
zo niet: wat is de beste route?

## Methode (read-only, 2 held-out probes op ACC, 2026-07-14)

- 6 GTINs die C/D **declareren** en waarvan de crop **géén** referentie is (echte
  held-out; 22 ref-bron-GTINs uitgesloten, 19 held-out kandidaten beschikbaar).
- Live pad per artwork: `propose_regions` → keurmerk-gate (0,5) → beste regio →
  `find_similar_references` (alle refs, open) én `find_similar_references_by_codes`
  (familie A–E, en alleen de gedeclareerde letter). `REFERENCE_SEARCH_PROBES`
  live-waarde (19.14). Alle 5 letters hebben 11/11 (A/C/D), 4/4 (B), 8/8 (E)
  actieve refs mét embedding — coverage is dus NIET het knelpunt.

## Resultaten

**(a) Open herkenning** (top-1 tegen álle refs): **1/6 juist** — de rest valt op
`NUTRISCORE_A` of vindt niets. Scores 0,29–0,53, ver onder de live-vloer 0,75.

**(b/c) Kruischeck + familie** (zelfde 6 GTINs):

| GTIN | decl. | familie-winnaar (sim) | letter goed? | kruischeck vs. decl. letter (sim) |
|------|:----:|:---------------------:|:------------:|:---------------------------------:|
| 08710871413046 | C | NUTRISCORE_C (0,321) | ✅ | 0,321 |
| 08710871413060 | C | NUTRISCORE_A (0,287) | ❌ | 0,274 |
| 08717774266397 | C | NUTRISCORE_A (0,653) | ❌ | 0,591 |
| 08710400400288 | D | NUTRISCORE_C (0,280) | ❌ | 0,242 |
| 08710624808259 | D | — (niets) | ❌ | — |
| 08710624988357 | D | NUTRISCORE_A (0,531) | ❌ | 0,527 |

- Familie-letter juist: **1/6**. Kruischeck-sim tegen de gedeclareerde letter:
  0,24–0,59 — grotendeels **onder de `find_similar_references_by_codes`-vloer 0,6**;
  1 GTIN vindt helemaal niets.
- Zelfs de correcte C-treffer haalt maar 0,32 — same-letter-gelijkenis is
  structureel laag.

## Verdict: **embedding-aanpak ONTOEREIKEND voor Nutri-Score — meer refs helpt niet**

Coverage/conditie-C is gehaald (C/D = 11 refs elk), maar dat maakt de herkenning
alleen "aan", niet betrouwbaar. De cosine-gelijkenissen zijn te laag én de letters
worden verward (default naar A). Dit is de al bekende embedding-zwakte bij fijn
onderscheid (bootstrap-recall ~20–28%; [[project_flywheel_recall_research]]).
Nutri-Score is een worst case: de 5 varianten zijn visueel bijna identiek (zelfde
5-kleurenbalk; alleen een andere letter uitvergroot), dus een generieke embedding
kan ze niet scheiden. **Nog meer same-letter-referenties oogsten verandert dit
niet** (same-letter-sim blijft ~0,3).

## Beste route (gekozen — Friso delegeerde de keuze)

**Bouw een Nutri-Score-specifieke herkenner die de aard van het logo benut**
(vast, gestandaardiseerd ontwerp, precies 5 varianten), i.p.v. generieke
embedding-similariteit:

1. **Detecteer de Nutri-Score-balk** — de kenmerkende horizontale reeks van 5
   afgeronde vakjes in de vaste gradiënt (donkergroen→lichtgroen→geel→oranje→rood).
   Dit is een sterk, gestandaardiseerd patroon (kleur-/template-/ankerdetectie),
   niet afhankelijk van fijne embedding-cosine.
2. **Lees de grade-letter** — bepaal welk vakje uitvergroot is / welke letter groot
   is: OCR van de uitvergrote letter, of "welke positie steekt uit" → deterministische
   5-klasse. Dit is een bounded probleem (5 klassen / 1 glyph), niet de open
   embedding-ruimte.

Dit **ontkoppelt** Nutri-Score van de zwakke generieke embedding en pakt precies
de faalmodus aan (letter-verwarring + lage sim).

### Interim productie-stance (nu geldig, zonder nieuwe bouw)
- **Vertrouw de declaratie voor de letter.** Voor de n8n-kruischeck (100–200/dag,
  producten declareren doorgaans hun Nutri-Score): neem de gedeclareerde letter als
  waarheid; ga die NIET onafhankelijk via embedding proberen te bevestigen (dat
  faalt). Aanwezigheid-bevestiging via embedding is óók onbetrouwbaar (deze probe),
  dus claim geen embedding-gedreven Nutri-Score-herkenning als "werkend".
- **Stop met Nutri-Score-referentie-oogst als middel om herkenning te verbeteren**
  (12.12/12.15-oogst): bewezen dat het de discriminatie niet oplost.

### Bewust NIET de route
- Meer refs / re-embedden / fine-tuning van de generieke embedding: 12.11 (synthetisch
  NO-GO) en de detector-spike ([[project_124_detector_spike]], data-bottleneck) toonden
  al dat de ML-kant hier vastloopt; deze probe bevestigt dat coverage niet het probleem is.

## Vervolg (permission-gated, echte bouw-inspanning)

Een **build-spike** voor de balk-detector + letter-lezer: valideer op een kleine
held-out set (dezelfde GTINs + declaratie als grondwaarheid) of detectie-van-de-balk
+ OCR/positie-van-uitvergroot-vakje de letter betrouwbaar leest (doel: ≫ 1/6). Klein
en offline te toetsen vóór integratie. Dít is een reële scope/effort-keuze (aparte
detectieroute) — greenlight door Friso vereist vóór de bouw.

## Artefacten
- Probes: `scratchpad/nutriscore_recog_probe.py` (twee runs: open + familie/kruischeck).
- Referentie-stand geverifieerd: A11/B4/C11/D11/E8 actief, allemaal met embedding.
