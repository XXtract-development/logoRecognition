# Spike 12.21b: Validatie A1 balk-detector-prototype (Fase 0 uit de technical research)

Status: done (spike — validatie afgerond; verdict = GO voor de bouw-story)

Datum: 2026-07-15 · read-only, alles op bestaande ACC-data (geen productie nodig).
Prototype: `scratchpad/ns_band_detector.py` (v3) + `ns_fullpage_runner.py`.

## Wat is gevalideerd

De rang-1-aanbeveling uit `research-technical-logo-herkenning-2026-07-14.md`:
een **deterministische Nutri-Score-lezer** (geen ML): vind de gestandaardiseerde
5-kleurenbalk via anker-gedreven kleurgeometrie en lees de letter als het
uitvergrote vakje. Twee testen:

1. **Crops** (45 review-bevestigde Nutri-Score-crops, letter bekend).
2. **Volledige artwork-pagina's** (alle 142 GTINs met GDSN-gedeclareerde letter;
   declaratie = grondwaarheid; 112 held-out = GTIN levert geen enkele referentie).

## Resultaten

| Test | juist | fout | geen-lezing | precisie bij lezing |
|---|:--:|:--:|:--:|:--:|
| 45 crops | **42 (93%)** | **0** | 3 | 100% |
| 142 volledige pagina's | **91 (64%)** | **2** | 49 | **97,8%** |
| — waarvan held-out (112) | 62 | 2 | 48 | 96,9% |
| — kritieke letters C/D (38) | **30** | 1 | 7 | 96,8% |

- **Vergelijk embedding-baseline (12.21): 1/6 juist, similarities 0,24–0,59.**
  Op dezelfde zes held-out C/D-GTINs leest het prototype er nu ≥4 correct.
- **Snelheid:** mediane 0,32 s per volledige pagina op de gedeelde CPU-host
  (142 pagina's in 105 s) — ruim productie-haalbaar, geen GPU.
- **Fail-safe gedrag:** bij twijfel "geen lezing" i.p.v. gokken (2 fouten op
  142; beide met randgeval-ratio 1,13–1,14).

## Duiding van de 49 geen-lezingen (pagina's)

Niet alle 49 zijn detector-missers:
- **Declaratie ≠ druk**: een deel van de 142 declareert de letter zonder het
  logo op het etiket te drukken (de 12.15-oogst vond op 16/38 C/D-GTINs óók
  geen Nutri-Score-regio). Het echte "logo staat er"-noemertal is kleiner.
- **Monochrome drukken** (bewezen op 2 crops: 0% kleurverzadiging) zijn per
  definitie onleesbaar via kleur → A2-vangnet (klein 5-klasse-model, NutriGreen).
- Clusters van dezelfde merkfamilie (6× 087172286188xx, 5× 087184528719xx)
  suggereren specifieke drukvarianten — gerichte winst voor de bouwfase.

## Iteratie-lessen (verwerkt in v3, relevant voor de bouw-story)

1. **Drukkleuren wijken af van de officiële hex-waarden** — twee gemeten
   varianten (A: H55-60 óf 72-78; D: 9-12 óf 16; E: 0-3 óf 4-7). Kalibratie op
   echte crops is essentieel.
2. **D/E overlappen qua hue tussen varianten** → D+E als één "warm" venster
   zoeken en daarna geometrisch splitsen (witte ring rond het uitvergrote vakje
   geeft twee losse blokken; anders kolomprofiel-splitsing).
3. **Anker-gedreven lokale zoektocht** (vanaf B — lichtgroen is zeldzaam op
   verpakkingen) i.p.v. grootste-vlakken-eerst: grote gele/rode designvlakken
   verdringen de logo-segmenten anders.
4. **Geen morphology-close op volledige pagina's** — die overbrugt de witte
   ring naar gekleurde achtergronden (rood fruit versmolt met D/E).
5. **Oriëntatie-robuustheid nodig**: verticale én ondersteboven-gedrukte
   varianten komen echt voor in de data.
6. **Ratio-drempel = afweegknop**: vloer 1,12 → 2 fouten/142; vloer 1,18 → 0
   fouten maar 2 goede lezingen minder. Voor kruischeck-gebruik (precisie boven
   dekking) is 1,18 de aangewezen stand; beide punten gedocumenteerd.

## Verdict: **GO voor de bouw-story**

Het prototype bewijst de research-aanbeveling: deterministische balk-detectie +
uitvergroot-vakje-lezing verslaat de embedding-aanpak op elke as (juistheid,
precisie, snelheid, verklaarbaarheid) en draait triviaal op CPU. Voorgestelde
bouw-story (BMAD, permission-gated):
- module in `apps/ml-service/app/` (familie-head-patroon uit de research §4.4);
- familie-router: nearest-ref-familie NUTRISCORE_* óf balk-aanwezigheid → head
  beslist de letter; output in het bestaande suggestie-formaat (review-UI,
  vliegwiel en n8n-contract ongewijzigd);
- kruischeck-stand: ratio-vloer 1,18 (0 fouten gemeten); review-stand: 1,12;
- A2-vangnet (klein 5-klasse-model op NutriGreen) als vervolg-story voor
  monochrome/afwijkende drukvarianten.

*Artefacten: `ns_band_detector.py` (v3, scratchpad), runner + ruwe uitslagen in
`/tmp/ns_fullpage_v3.txt` op de ml-container; runs 2026-07-14/15, getemperd.*
