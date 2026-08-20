---
story: 20.20 — De declaratie-oogst weer aan de gang, en goedkoop houden
onderdeel: AC7 — de aandrijving
status: vastgelegd; het PLAATSEN op acceptatie is deel B (permission-gated)
opgesteld: 2026-08-20
---

# De aandrijving van de declaratie-oogst

> [!warning] Niets in dit document is uitgevoerd.
> Het plaatsen van een periodieke start op `vanilla` schrijft op de
> acceptatie-omgeving en wacht op expliciete toestemming (AC11). Dit bestand legt
> alleen vast wát er zou moeten staan, zodat de handeling later een kwestie van
> kopiëren is en niet van opnieuw bedenken.

## Waarom inhalen en bijhouden gescheiden zijn

Een nachtelijke run haalt ongeveer **35 paren**. De achterstand is **1097 paren**.
Eén nachtelijke start zou de achterstand dus in **ruim 31 nachten** wegwerken.
Daarom twee verschillende dingen:

| | wie start | hoe vaak | tijdsbudget |
|---|---|---|---|
| **Inhalen** | een mens, met de hand, éénmalig | één keer | `DECLARED_HARVEST_MAX_SECONDS=36000` (10 uur; het werk is ~8,5 uur). Het slot vervalt automatisch pas ná dat budget — zie hieronder. |
| **Bijhouden** | `cron` op `vanilla` | elke nacht | `DECLARED_HARVEST_MAX_SECONDS=1000` (de standaard) |
| **De kaart herbouwen** | `cron` op `vanilla` | elke zondagnacht | geen eigen budget; de bouwer is klaar in seconden |

Bijhouden hoeft na het inhalen alleen nog het verschil te doen. Dat verschil is
klein — dat is precies de winst van AC4: de oogst onthoudt nu wát hij nakeek, dus
hij rekent niet elke nacht dezelfde 1097 paren opnieuw door.

## De drie starts

### 1. Inhalen — één keer, met de hand

Draait ín de ml-service-container. Niet in `cron` zetten: dit is een eenmalige
inhaalslag met een tijdsbudget dat je nooit elke nacht wilt.

```bash
DECLARED_HARVEST_MAX_SECONDS=36000 \
DECLARED_HARVEST_BATCH=1400 \
python -m app.services.queue_harvest_declared
```

Het slot uit AC8 zorgt dat deze run een tweede start weigert zolang hij loopt —
óók als hij langer dan zes uur duurt. De run legt zijn eigen vervaltijd in de
marker: zijn tijdsbudget plus een halfuur marge (hier dus 10,5 uur). De
nachtelijke cron van 01:17 leest die vervaltijd en weigert daarop, in plaats van
op zijn eigen zes-uursgrens.

> [!warning] Waarom dit erin staat
> Tot de code-review van 20 augustus 2026 stond de vervaltijd op een vaste zes
> uur. De inhaalronde mag tien uur draaien. Liep hij over 01:17 heen, dan was de
> marker "verlopen" en startte de cron een **tweede** declaratie-oogst in
> dezelfde 8 GiB-container — precies het OOM-recept dat AC8 moet uitsluiten, en
> met de zwaarste run als slachtoffer.

### 2. Bijhouden — elke nacht op `vanilla`

Het script staat in de repository als
[`scripts/deployment/declared-harvest.sh`](../../scripts/deployment/declared-harvest.sh);
het wordt op `vanilla` naast het bestaande `keurmerk-harvest.sh` geplaatst.

```cron
# bestaand — de VOLUME-oogst (queue_harvest), niet aankomen
37 3 * * * /usr/local/bin/keurmerk-harvest.sh

# nieuw — de DECLARATIE-oogst (queue_harvest_declared)
17 1 * * * /usr/local/bin/declared-harvest.sh
```

**01:17 en niet 03:37.** De twee oogsters draaien in **dezelfde**
ml-service-container met 8 GiB, en de declaratie-oogst breekt zichzelf af boven
75% van dat gedeelde geheugen. Met een tijdsbudget van 1000 seconden is de
declaratie-run rond 01:34 klaar — ruim twee uur voordat de volume-oogst begint.
Het slot uit AC8 is het vangnet als een run toch uitloopt; de starttijd is de
eerste verdediging.

### 3. De kaart herbouwen — elke zondagnacht

Zonder dit komen de codes die op hun eerste referentie wachten nóóit in de kaart
zodra ze die referentie krijgen, en staat deze story over een maand weer stil op
precies dezelfde manier.

Het script staat in de repository als
[`scripts/deployment/build-declared-harvest-map.sh`](../../scripts/deployment/build-declared-harvest-map.sh).

```cron
# nieuw — de kaart bijwerken vóór de nacht waarin hij gelezen wordt
7 0 * * 0 /usr/local/bin/build-declared-harvest-map.sh
```

De bouwer draait met `--apply`. Krimpt de kaart met meer dan 10%, dan schrijft hij
niet maar meldt hij — een mens beslist dan of `--force` op zijn plaats is.

Het script draait **het gecompileerde bestand** (`node dist/scripts/build-declared-harvest-map.js
--apply`) en niet `npx tsx src/…`: het beeld op acceptatie bevat alleen `dist`, en
`tsx` staat in geen enkele `package.json` van deze repository. De containernaam
wordt **opgezocht op zijn voorste deel** (`app-<uuid>-`) omdat Coolify er bij elke
deploy een nieuw tijdstempel achter zet; overschrijven kan met `API_CONTAINER`.

Beide startscripts schrijven hun uitvoer naar een logbestand én naar stdout, zodat
een geblokkeerde krimp, een geweigerde run (`locked`), een onbruikbare kaart
(`map_unavailable`) of een ontbrekende vastlegging (`checks_unavailable`) niet in
het niets van een cron-proces verdwijnt:

| script | logbestand | te overschrijven met |
|---|---|---|
| `declared-harvest.sh` | `/var/log/declared-harvest.log` | `DECLARED_HARVEST_LOG` |
| `build-declared-harvest-map.sh` | `/var/log/declared-harvest-map.log` | `DECLARED_HARVEST_MAP_LOG` |

## Instellingen, en waar elke instelling staat

De twee diensten draaien in **aparte containers**. Een omgevingsvariabele "op één
plek" bestaat hier dus niet.

| instelling | waarde | waar hij gezet wordt |
|---|---|---|
| `DECLARED_HARVEST_MAX_SECONDS` | `1000` (nachtelijk) / `36000` (inhalen) | ml-service-container; nachtelijk via `declared-harvest.sh`, inhalen op de opdrachtregel |
| `DECLARED_HARVEST_BATCH` | `400` (nachtelijk) / `1400` (inhalen) | idem |
| `DECLARED_HARVEST_PER_CODE_CAP` | `15` (standaard) | ml-service-container, Coolify-omgevingsvariabelen |
| `DECLARED_HARVEST_FLOOR` | `0.60` (standaard) | ml-service-container, Coolify-omgevingsvariabelen |
| `DECLARED_HARVEST_LOCK_MAX_AGE_SECONDS` | `21600` (6 uur) — **ondergrens**; een run met een groter tijdsbudget zet zijn eigen, ruimere vervaltijd in de marker | ml-service-container, Coolify-omgevingsvariabelen |
| `DECLARED_HARVEST_LOCK_GRACE_SECONDS` | `1800` (marge bovenop het tijdsbudget: de lopende paginagroep en de slot-flush moeten nog af) | ml-service-container, Coolify-omgevingsvariabelen |
| `DECLARED_HARVEST_MEM_STOP_FRACTION` | `0.75` (standaard, Story 20.11) | ml-service-container, Coolify-omgevingsvariabelen |
| `DATABASE_URL`, MinIO-instellingen | bestaand | **api**-container — de kaartbouwer draait daar, niet in de ml-service |
| `KEURMERK_INDEX_LIMIT` | ≥ het volledige GTIN-universum | **api**-container; de standaard van 500 kapt de bronindex af en zou de kaart uitkleden |

## Wie schrijft welk bestand

| bestand | schrijver |
|---|---|
| `flywheel-index/keurmerk-etiket-index.json` | `build-keurmerk-index.ts` (api-container) |
| `flywheel-index/declared-harvest-map.json` | `build-declared-harvest-map.ts` (api-container) |
| `keurmerk-harvest/declared-harvest-state.json` | **de ml-service** (`queue_harvest_declared.py`) — de bouwer leest dit bestand alleen |
| tabel `declared_harvest_checks` | **de ml-service** |
