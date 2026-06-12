# Story 12.3 — discriminerende probe: het knelpunt is de GUIDE-REFERENTIE, niet de embedding

Datum 2026-06-12 · ACC ML-container · harnas `apps/ml-service/scripts/spike_iter2_loo_probe.py` ·
verdict-set 78 echte crops / 24 klassen · artefact `/tmp/iter2-loo.json`. **Dit keert de
strategie om.**

## Waarom deze probe

Elke eerdere meting (pgvector-baseline, iter1, iter2) scoorde een echte crop tegen een **guide-logo**-
referentie. Een 0 %-klasse verwarde dus twee totaal verschillende oorzaken:
1. **Bevroren-feature-plafond** — effb0 kán de klassen niet scheiden (fix: backbone ontdooien; duur).
2. **Guide-referentie-domeinkloof** — effb0 *kan* het wél, maar het guide-logo lijkt niet op de echte
   crop (fix: echte crops als referentie; goedkoop, géén training).

RECYCLABLE dat FAIRTRADE matcht op cosine **0,196** wees al op (2). Deze probe verwijdert de guide-
referentie volledig: **leave-one-out k-NN tussen de 78 echte crops** in ruwe bevroren effb0 (1280-dim,
geen kop, geen synthese). Clusteren echte crops per klasse?

## Resultaat — ze clusteren sterk

| metriek | waarde |
|---|---:|
| **LOO k-NN micro** (15 multi-crop klassen, 69 crops) | **87,0 %** |
| **LOO k-NN macro** | **79,8 %** |
| mediaan NN-cosine (correct) | 1,00 |
| vergelijk: top-1 tegen **guide-logo** (baseline) | 35,9 % micro |

**RECYCLABLE_GENERAL_CLAIM = 100 % LOO** (26/26) — de crops die 0 % scoorden tegen het guide-logo zijn
elkáár​s naaste buur. effb0 scheidt ze prima; ze liggen alleen ver van het guide-logo.

→ **Diagnose = (2), de guide-referentie-domeinkloof.** De bevroren effb0-backbone is in orde. Het hele
fine-tuning-spoor (iter1/iter2) loste het verkeerde probleem op: het probeerde de embedding te
veranderen, terwijl de **referentiebibliotheek** de fout is — geseed met schone GS1-guide-logo's die
niet lijken op echte artwork-crops.

## De goedkope fix (geen training)

**Voeg bevestigde echte crops toe als referentie-embeddings per klasse** (naast/in plaats van het
guide-logo), dan herbouw de referentie-index (`rebuild_reference_embeddings` bestaat sinds 12.1). De
LOO-meting ís het bewijs: met één echte crop/klasse als referentie spríngt top-1 van ~36 % (guide) naar
~80–87 % (echte crop). De opgeschoonde queue (12-06; 2.154 items ≥ 0,5) is exact de oogstbron — en
12.6-harvest voedt nu **referenties**, niet training.

## Eerlijke kanttekeningen (de 87 % is optimistisch)

- **Near-duplicaten blazen de LOO op.** De 26 RECYCLABLE-crops komen van **3 GTINs** → grotendeels
  bijna-identieke crops (mediaan NN-cosine 1,00). Hun 100 % LOO bewijst wél de scheiding *tussen*
  klassen, maar overschat de generalisatie *binnen* een klasse. Schonere test = **leave-one-GTIN-out**
  (alle crops van een GTIN tegelijk weghouden) — met meestal 1–3 GTINs/klasse nu nog te dun; doe dit
  zodra 12.6 meer GTINs/klasse oplevert.
- **Niet alle klassen clusteren.** EUROPEAN_V_LABEL_VEGAN = 0 % LOO (n=2, verward met LACTOSE_FREE);
  Nutri-Score E↔B kruist (variant-family). Reële restverwarring, maar 80 % macro >> 46 % guide.
- **Absolute getallen blijven licht** (15 klassen, near-dup-inflatie). De **richting** — echte-crop-
  referenties ≫ guide-referenties — is robuust en goedkoop te exploiteren/valideren.

## Aanbevolen koers (vervangt de eerdere C→B-afweging)

1. **Bouw de referentiebibliotheek om naar (ook) echte bevestigde crops** per klasse, begin met de
   klassen die het meest in de queue voorkomen (RECYCLABLE eerst — 53 % van de queue, 0 %→ naar
   verwachting hoog). Houd het guide-logo als fallback voor klassen zónder echte crop.
2. **Her-meet** top-1 op een leave-one-GTIN-out-split (eerlijke generalisatie) ná de ombouw.
3. **Dedup de referentie-embeddings** (146 vectoren/38 logo's; FAIRTRADE 3×) — los hiervan, helpt bias.
4. **12.6-harvest** uit de opgeschoonde queue om echte crops/GTINs per klasse op te voeren → betere
   referenties + eerlijker eval. **Fine-tuning/ontdooien is voorlopig van tafel** (verkeerd probleem).

## Reproductie
```bash
ML=$(ssh vanilla "docker ps --format '{{.Names}}' | grep '^ml-service-qsookwow'")
ssh vanilla "docker exec $ML mkdir -p /app/scripts && docker cp /tmp/spike_iter2_loo_probe.py $ML:/app/scripts/ && docker cp /tmp/verdict-78.json $ML:/tmp/"
ssh vanilla "docker exec $ML /opt/venv/bin/python /app/scripts/spike_iter2_loo_probe.py --verdict /tmp/verdict-78.json --out /tmp/iter2-loo.json"
```
