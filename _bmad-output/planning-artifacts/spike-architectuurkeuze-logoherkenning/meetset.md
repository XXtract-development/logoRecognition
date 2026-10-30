---
title: Meetset voor de architectuurkeuze (voorbereid tot menselijke bevestiging)
hoort_bij: SPEC.md (CAP-1)
datum: 2026-10-18
status: AI-voorbeoordeling klaar; wacht op bevestiging door Friso via de invulpagina
lijst: meetset.tsv
---

# Meetset

> [!warning] Nog geen waarheid
> Alles hieronder is AI-voorbeoordeling (`ai-prelabel`), geen grondwaarheid. Pas na Friso's bevestiging per etiket (invulpagina, collectie `waarheid`) telt een etiket mee.

## 1. Samenstelling

VERIFIED (scripts en tussenbestanden in `~/logo-meetset-20261018/`; zie §4):

| stap | aantal |
|---|---|
| kern: steekproef van 11-10 ([steekproef-definitief.tsv](../eindtest-logo-pijplijn/steekproef-definitief.tsv)) | 200 |
| eruit wegens overlap met training, referenties, kandidaten, gold-set, harde negatieven of declaratie-oogst (GTIN, ACC 18-10) | 25 |
| eruit: 23 "zonder"-etiketten (vaste pseudo-willekeurige volgorde; er blijven 50 negatief-kandidaten naast 102 "met") | 23 |
| aanvulling 1 (schaarse keurmerken uit de productiepool, ≤2 per merk) + 12 alcoholproducten voor de zwangerschapswaarschuwing (op productnaam, GPC alcohol) | 85 |
| aanvulling 2 (keurmerken die na bouwen onder ±16 gedeclareerde bleven) | 40 |
| **opgehaald** (alleen-lezen: replica-SELECT + rsync van banana `/media/Xmedia`) | 277 |
| eruit: lagen ontbreken op schijf (9) of geen lagen (1) | 10 |
| eruit: gecombineerd beeld boven 80 MP (de pijplijn weigert dat) | 24 |
| **meetset** | **243 etiketten, 62 merken** |

- Uitsluitquery (alleen SELECT, ACC `logo_recognition`): GTIN's uit `training_data.crop_path`, `training_data.provenance->>'sourceFile'`, `reference_logos.storage_path`, `reference_candidates`, `gold_set_records`, `hard_negatives`, `declared_harvest_checks` → 940 unieke GTIN's.
- Bronhash: de 742 opgehaalde lagen zijn tegen de 999 hashes uit `sourceFile`-namen gelegd: 0 treffers. INFERENCE: het hashschema is niet hetzelfde als sha256 van de geconverteerde laag (3 steekproeven op banana kwamen niet overeen), dus deze controle zegt weinig. Bijna-gelijke artwork van productvarianten is niet uitgesloten.
- Beeld = nabouw van de mediaserver (alle actieve geconverteerde lagen onder elkaar; lagen > 4096 px of > 20 MB verkleind; > 10 MB PNG verkleind), met Pillow in plaats van ImageMagick. De sha256 per etiket staat in [meetset.tsv](meetset.tsv); elke variant krijgt precies die bytes.

## 2. Per keurmerk (AI-voorbeoordeling, nog niet bevestigd)

"Voorgesteld" = etiketten waarop minstens één beoordelaar het keurmerk zag; "eens" = beide. "Gedeclareerd" = GS1-declaratie (geen bewijs).

| keurmerk | voorgesteld | A en B eens | gedeclareerd | waarvan voorgesteld | merken |
|---|---:|---:|---:|---:|---:|
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 16 | 16 | 16 | 16 | 7 |
| WEIDEMELK | 18 | 18 | 16 | 16 | 6 |
| EU_ORGANIC_FARMING | 12 | 12 | 13 | 12 | 9 |
| RECYCLABLE_GENERAL_CLAIM | 37 | 29 | 50 | 31 | 20 |
| BETER_LEVEN_1_STER | 16 | 16 | 16 | 15 | 3 |
| PREGNANCY_WARNING | 18 | 18 | 0 | 0 | 6 |
| GREEN_DOT | 27 | 27 | 29 | 26 | 13 |
| VEGAN | 21 | 19 | 30 | 11 | 11 |
| NUTRISCORE_A | 10 | 10 | 13 | 10 | 5 |
| EUROPEAN_V_LABEL_VEGAN | 18 | 15 | 16 | 15 | 8 |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 21 | 21 | 22 | 21 | 8 |
| MARINE_STEWARDSHIP_COUNCIL_LABEL | 16 | 16 | 16 | 16 | 6 |
| NUTRISCORE_C | 17 | 17 | 17 | 16 | 3 |
| NUTRISCORE_B | 15 | 15 | 15 | 15 | 5 |
| VEGAN_SOCIETY_VEGAN_LOGO | 16 | 16 | 16 | 16 | 5 |

- Negatief-kandidaten: 66 van 243 etiketten zonder enig top-15-voorstel.
- Alle 15 keurmerken hebben ≥10 voorgestelde etiketten; NUTRISCORE_A zit precies op 10 en gaat naar "te weinig voorbeelden" ([meetopzet.md §5](meetopzet.md)) als Friso er één afkeurt.
- > [!warning] Merkconcentratie
  > Beter Leven 1 ster en Nutri-Score C komen van 3 merken, Nutri-Score A/B en Vegan Society van 5. Een uitkomst voor die soorten zegt vooral iets over de huisstijl van die merken.
- Opvallend: VEGAN is 30× gedeclareerd maar maar 11× op die etiketten gezien; RECYCLABLE 50× gedeclareerd, 31× gezien. De declaratie zegt hier weinig over het beeld.

## 3. Overeenstemming tussen de beoordelaars

Beoordelaar A = Claude Opus-klasse, B = Claude Sonnet-klasse; elk als losse subagent per batch, eigen context, zag alleen overzicht + tegels (werkschaal ≤2800 px breed, tegels 1400 px, lege tegels overgeslagen; 2.021 tegels), geen declaraties en geen oordeel van de ander. Instructie: `beoordelaar-instructie.md` (promptVersion v1-20261018).

| maat | uitkomst |
|---|---|
| paren (etiket × keurmerk) | 3.645 = 243 × 15 |
| beide ja / beide nee / verschil | 265 / 3.367 / 13 → eens over aanwezigheid in 3.632 van 3.645 (99,6%) |
| verschillen per keurmerk | RECYCLABLE 8, V-label 3, VEGAN 2, overige 0 |
| voorgestelde vakken (samengevoegd) | 472 |
| vak door beide gezien (overlap ≥0,3) | 326 van 472 (69%) |
| alleen A / alleen B / zelfde plek, andere code | 79 / 65 / 2 |

INFERENCE: de meeste "alleen A/B"-vakken zijn herhalingen van hetzelfde logo op meerdere aanzichten van één drukvel, die de ene beoordelaar wel en de andere niet apart meldde. De verschillen over aanwezigheid zitten bijna allemaal bij recyclingsymbolen (algemene lus versus afvalscheidingspictogram, materiaalcode of "recycled content"-zegel) en bij V-label versus eigen vegan-badge: precies de lookalike-grenzen.

Bekende onvolkomenheden (uit de antwoorden van de beoordelaars):
- Bij meerdere batches gaf het beeldgereedschap tijdelijk "request limit"; beoordelaars hebben die tegels opnieuw bekeken, maar bij beoordelaar A (batch 24) en B (batch 24–27) is een deel na het schrijven niet opnieuw nagelopen.
- Enkele beoordelaars zagen bij een controle de bestandsnamen of inhoud van eigen eerdere batches (zelfde beoordelaar, andere etiketten); geen kruisbesmetting A↔B gemeld.
- Eén B-oordeel was gekopieerd van een gelijk etiket; verworpen en opnieuw beoordeeld.
- Afwijking van [WAARHEID.md](../eindtest-logo-pijplijn/WAARHEID.md) §5: beoordelaars werkten per batch (3–20 etiketten) in één context, niet vers per etiket. De 27 etiketten uit batches 24–27 staan op de invulpagina gemarkeerd voor extra controle.
- Zes A-vakken lagen net buiten de tegel (coördinaat > 1000); begrensd tot de etiketrand.

## 4. Waar staat wat (niet in de repo)

- Beelden en werkbestanden: `~/logo-meetset-20261018/` (blijvende lokale kopie van de scratchpad-map, buiten de repo; VERIFIED 18-10: sha256 van alle 243 gecombineerde PNG's gelijk aan [meetset.tsv](meetset.tsv)). Inhoud: `beelden/`, `beelden2/` (gecombineerde PNG's in `gecombineerd/`), `werk/` (tegels, `tegels.json`), `oordeel/A`, `oordeel/B`, `voorstel.json`, scripts `selecteer.py`, `bouw.py`, `voorbereid.py`, `samenvoegen.py`, en `pagina/` (invulpagina met samengestelde beelden).
- Invulpagina (privé artefact, alleen Friso): https://claude.ai/artifact/KJvPSJk5WKq8Vcsj8bUS73 — keuzes in de collectie `waarheid`. Kaartnummer ↔ doc_id: kolom `kaart` in [meetset.tsv](meetset.tsv).
