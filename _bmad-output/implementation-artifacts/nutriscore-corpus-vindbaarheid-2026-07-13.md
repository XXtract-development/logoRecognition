# Nutri-Score corpus-vindbaarheid — is er genoeg C/D om de vorm-oogst-route te bouwen?

Datum: 2026-07-13 · **read-only / offline** — geen writes, geen registratie, geen queue-mutatie, geen training. Gedraaid via `docker exec` in de gedeployde ml-container (base-image-tag `81c1012`), alleen bestaande code (`propose_regions`, `keurmerk_probability`, `model_manager`). DB/MinIO read-only.

## Conclusie: **GO-signaal** — er is plausibel ruim genoeg (ook C/D) om de vorm-oogst-route te bouwen

Geschat **~734 Nutri-Score-achtige regio's** in het volledige artwork-corpus, waarvan ruwweg **~21% geel/oranje (C/D-achtig)** → geëxtrapoleerd **~160 C/D-achtige regio's**. Zelfs met een conservatieve precisie (ruime drempel → false positives, mens-review filtert) blijven er ruim voldoende genuïne C- en D-crops over om beide letters over de k=3-drempel te tillen (nodig: ~3 elk).

---

## Meetopzet

- **Vorm-pool (letter-onafhankelijk):** 24 Nutri-Score-referenties = echte A/B/E-crops (`source ∈ review-confirmed/realref-live-poc/flywheel-promotion`) + de 5 synthetische zaden. De 12.11-spike toonde dat de VORM over de letters heen overlapt — dus een ruime cosine-match tegen deze pool vangt Nutri-Score-regio's ongeacht de letter.
- **Sample:** 400 artwork-GTINs deterministisch (elke ~4e van 1857), 397 daadwerkelijk verwerkt in 590s (geen time-out).
- **Pipeline per pagina:** `propose_regions` → per regio `model_manager.generate_embedding` (efficientnet_b0, frozen) → keurmerk-gate `keurmerk_probability ≥ 0,5` (voorfilter) → cosine tegen de vorm-pool; **treffer = max cosine ≥ 0,60** (ruime vorm-drempel).
- **Grove letter-schatting per treffer:** HSV-histogram-heuristiek op de regio (dominante tint van verzadigde pixels): groen→A/B, geel→C, oranje→D, rood→E.

---

## Resultaten

| Metric | Waarde |
|--------|-------:|
| Corpus (artwork-GTINs totaal) | 1.857 |
| Gesamplede GTINs / verwerkt | 400 / **397** |
| Regio's gescand | 17.836 |
| **Nutri-Score-treffers (vorm, ≥0,60)** | **157** |
| Treffers per verwerkte GTIN | 0,396 |
| **Extrapolatie naar volledig corpus** | **~734 regio's** |
| Mediane treffer-cosine | 0,659 |

### Grove kleur-gebaseerde letter-verdeling (157 treffers)

| Kleur → letter | treffers | aandeel |
|----------------|---------:|--------:|
| groen → A/B | 83 | 53% |
| rood → E | 23 | 15% |
| **oranje → D** | **18** | 11% |
| **geel → C** | **16** | 10% |
| onduidelijk (?) | 17 | 11% |
| **C/D-achtig (geel+oranje)** | **34** | **~22%** |

**Extrapolatie C/D-achtig:** 34/397 per GTIN × 1.857 ≈ **~159 C/D-achtige regio's** in het volledige corpus.

---

## Precisie-kanttekening (eerlijk)

De ruime drempel (0,60) + een vorm-pool die de synthetische zaden bevat (die in 12.11 losjes clusterden) levert **zeker false positives**: andere ronde/kleurrijke keurmerken en graphics matchen mee. De kleur-heuristiek is bovendien grof — een groen bio-logo telt als "A/B groen", een geel recycling-symbool als "C geel". De 157 treffers en de 34 C/D-achtige zijn dus **bovengrenzen**; de menselijke letter-review (die het echte-crop-pad sowieso vereist) filtert de valse treffers eruit.

**Waarom het toch een GO is:** zelfs bij een conservatieve netto-precisie van 25–40% blijven er corpus-breed ~40–65 genuïne C/D-crops over — ruim boven de ~3 per letter die C en D nodig hebben om herkenning-klaar te worden. De marge is zó groot dat de onzekerheid in de precisie de conclusie niet omkeert.

---

## Aanbeveling

**Bouw de vorm-oogst-route** ("zoek Nutri-Score-regio's op de vorm, mens labelt de letter") als aparte story:
1. Oogst regio's die de vorm-pool matchen (ruime drempel) uit het artwork-corpus — letter-onafhankelijk.
2. Leg ze voor aan de menselijke review-wachtrij (bestaand 19.8-pad), waar de mens de **letter** (A–E) bevestigt — dit filtert meteen de false positives.
3. Zodra C en D elk ≥3 door-mensen-bevestigde crops hebben, draait conditie C (19.9) voor die letters zoals al bewezen voor A/B/E (~100%).

Dit is het bewezen ECHTE-crop-pad (synthese was NO-GO in 12.11); het corpus bevat er plausibel ruim genoeg voor, inclusief de schaarse C/D.

*Read-only, geen writes/registratie/training. 400 GTINs gesampled (397 verwerkt), 17.836 regio's, 157 treffers. Image-tag `81c1012`.*
