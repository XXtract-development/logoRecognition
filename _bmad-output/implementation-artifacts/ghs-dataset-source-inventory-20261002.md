---
datum: 2026-10-02
status: read-only broninventarisatie; menselijke beeldannotatie niet uitgevoerd
eigenaar: onafhankelijke GHS-datasetonderzoeker
scope: bestaande verpakkingsbeelden en onafhankelijke GHS-holdout
---

# Beschikbare GHS-verpakkingsbronnen

> [!warning]
> De negen officiële templates onder `apps/ml-service/app/assets/ghs` zijn geen onafhankelijke echte verpakkingsbeelden. GHS-declaraties selecteren kandidaten; ze bewijzen geen zichtbaar symbool, box, leesbaarheid, beeldrechten of onafhankelijke familie.

## Gecontroleerde lokale bronnen

**VERIFIED:** `tests/validation/acceptatie-dataset/dataset-v0.json` en `tests/validation/gold-set-oogstrun.json` bevatten elk 91 rijen, 83 verschillende sourceFile-sleutels en 83 GTINs; geen rij heeft een GHS-naam of GHS01–09-label. Deze twee bestanden vormen geen twee onafhankelijke datasets. `tests/validation/labels-oogstrun.json` is een id→ECHT/VALS-map met 91 entries, geen extra beeldcollectie. `tests/validation/declared-marks-goldset.json` bevat 74 GTIN-records zonder GHS-code. Geteld door volledige JSON-lezing en vergelijking met de negen canonieke namen plus nummeraliassen.

Concrete bestaande originele bronverwijzingen, **zonder GHS-bewijs**:

- `artwork/00727452001064/1ea172fa388d9c5d4aff0e6f9d31192be53660c55376b45ac18f0c91d447021c_converted-0.png`
- `artwork/03059946316376/74f54da124969bdcd5305224a50930e22d3e8a77e41df931280ed76ffd92d21e_converted-0.png`

**VERIFIED:** `tests/validation/keurmerk-declaratie-frequentie.md:24` meldt een historische 2026-06-09 steekproef van 5000 producten bij artworkleveranciers, waarvan 115 met `gHSSymbolDescriptionCode`. Het document bevat geen lijst van die 115 GTINs, originele beelden of annotaties. Dit is een bruikbare selectieaanwijzing, geen huidig dekkingsbewijs.

**VERIFIED:** lokale Claude-projectlogs zijn doorzocht op `gHSSymbolDescriptionCode`, met uitsluitend GHS-codes en 14-cijferige kandidaatidentifiers geëxtraheerd om credentials niet uit te voeren. De relevante codelijstoutputs leveren geen concrete GHS-GTINs. Projectgeheugen `project_prod_corpus_route.md` beschrijft historisch de originele corpus onder `/media/Xmedia/{GLN}/label/{mediaId}/…`, en de geactiveerde media.stage/catalog.stage-leesroute. Die historische corpusgrootte en beschikbaarheid zijn hier niet live herbevestigd; geen bewijs van GHS-aanwezigheid per bestand.

## ACC alleen-lezen inventaris

SSH-registry vooraf gelezen: `/Users/frisovanweelden/.codex/worktrees/claude-team-config-forbid-migrate-fresh/claude/ssh-registry.md` (root bevestigde resolved copy; oorspronkelijke `~/.Codex/ssh-registry.md` ontbreekt). Huidige ML-container met `docker ps --format '{{.Names}}'` geverifieerd: `ml-service-qsookwow8koko0kwg00g0cwk-185603363370` op alias vanilla. Databasecredentials uitsluitend uit bestaande containeromgeving gelezen, niet getoond. `asyncpg` met expliciete `transaction(readonly=True)`; server `logo_recognition`, `10.0.0.6/32`, `transaction_read_only=on`. Geen remote bestanden gemaakt.

**VERIFIED:** 3502 importrecords, 1874 verschillende GTINs en 133 niet-null GLNs. Alle reviewrecords op de negen canonieke codes en GHS01–09: nul. Bestandsnamenfilter `ghs|hazard|clean|detergent|bleach|schoon|zeep|wasmiddel|ontvet|corros|spray`: geen matches. Dit bewijst uitsluitend geen match in die velden, niet dat de 3502 beelden geen GHS bevatten.

Exact uitgevoerde SELECTs:

```sql
SELECT current_database() AS database, inet_server_addr()::text AS address,
       current_setting('transaction_read_only') AS readonly;
SELECT count(*)::int AS rows, count(distinct gtin)::int AS gtins,
       count(distinct gln)::int AS suppliers FROM artwork_imports;
SELECT t3777_code,count(*)::int AS count FROM artwork_review_items
WHERE t3777_code = ANY($1::text[]) GROUP BY t3777_code;
-- $1 = GHS01..GHS09 plus alle negen canonieke GHS-namen.
SELECT gtin,gln,media_id,file_name,storage_path,pages,sha256_hash
FROM artwork_imports
WHERE file_name ~* '(ghs|hazard|clean|detergent|bleach|schoon|zeep|wasmiddel|ontvet|corros|spray)'
ORDER BY gtin LIMIT 50;
SELECT gln,count(*)::int AS count FROM artwork_imports
GROUP BY gln ORDER BY count DESC LIMIT 10;
```

## Bewijsgrens en vervolg

**INFERENCE:** de gerichte route is GTIN/GLN + onafhankelijke GHS-declaratie koppelen aan import/mediaId/storagePath/pages, vervolgens originele beelden menselijk inspecteren. Bestaande keurmerkcrops zijn geen bewijs dat GHS op het bijbehorende hele etiket afwezig is.

Voor een holdout zijn per origineel nodig: hergebruikrecht, hash, familie/artworkversie, volledig beeld en alle afzonderlijke GHS-boxes, dubbel gecontroleerde zichtbare labels, leesbaarheid en splitbesluit. Meerdere pictogrammen en alternatieve crops/versies blijven één familie. Volledig onleesbare beelden blijven abstentie; geen declaratie omzetten in verzonnen visuele waarheid.

Alleen dit evidencebestand en later expliciet door root geautoriseerde bronbeeldcache buiten git geschreven. Geen productcode, databasewrites, modeltraining, containerwijzigingen, Git-acties of externe publicatie uitgevoerd.

## Concrete ontwikkelkandidaten: etiket × declaratie

**VERIFIED:** gerichte ACC-join op bestaande AISE/ECARF/CRUELTY_FREE-reviewcodes leverde 17 volledige etiket-storagepaths bij 14 GTINs. Deze keuze is een prioriteringsheuristiek, geen GHS-label. De query retourneerde 17 rijen onder LIMIT 30; geen truncatie van deze gerichte query. SQL:

```sql
SELECT DISTINCT a.gtin,a.gln,a.storage_path,a.pages,a.sha256_hash,r.t3777_code
FROM artwork_imports a
JOIN artwork_review_items r ON r.gtin=a.gtin
WHERE r.t3777_code IN ('AISE_2020_BRAND','AISE_2020_COMPANY',
                       'CRUELTY_FREE_PETA','ECARF_SEAL')
ORDER BY a.gtin,a.storage_path LIMIT 30;
```

Alle teruggegeven `pages` waren `{}`, `sha256_hash` null. De storagepath is dus een concrete geïmporteerde etiketpagina, geen bewezen cryptografisch gevalideerde originele PDF. Hashes moeten uit gelezen bytes worden berekend. Alle 17 reviewmatches zijn AISE_2020_COMPANY; niet automatisch menselijke GHS-waarheid.

Hieronder bestaat elke storagepath uit `artwork/{GTIN}/{bestandsnaam}`; geen crop-prefix:

| GTIN | GLN | Bestandsnaam | Catalogstatus / GHS-waarde |
|---|---|---|---|
| 03245990329404 | 8716109000002 | 2ab19f2b4ef7ee328795e1f56e3df42ac48d2ee55d560148a03fd8085be3bbaa_converted-0.png | 200 / geen GHS-tag |
| 03665468402253 | 8710552001005 | a4eef657774e0fb52f010cc60031afa0f84b54beb20422cd60534a162d73d200_converted-0.png | 200 / EXCLAMATION_MARK |
| 04743318104188 | 8718781030001 | f82eaaa553e9a1031048ef91f41506060a38317edd76694225761c4c85236c83_converted-0.png | 200 / geen GHS-tag |
| 05414807004041 | 8717774260302 | 2dfa4ee6c76d1ca992b33d11d2b0e6b7738d23290989f7b9418264f22d1e89f7_converted-0.png | 200 / geen GHS-tag |
| 08000146031236 | 8712423033887 | d0f9989245e80663f1b466adf33d23192e219b8cfbc713e9c941e987f85d0960_converted.png | 200 / geen GHS-tag |
| 08716769014166 | 8716769999999 | eaf8ab29b94c6f3e941bff9d46b0100554b5d3ef5540127fb7f9a62e5729e606_converted-0.png | 200 / geen GHS-tag |
| 08719325110937 | 8712573000005 | 918592f453b84e4b4717480d69d3249d4aa74c8259f4bfd30c6b57456f4c91ce_converted-0.png | 200 / geen GHS-tag |
| 08720065008866 | 8710552001005 | 43edd9e0ee0e69a42d8e5f34fd003ff56d311a43b9406d2cb0f62da79299bcde_converted-0.png | 200 / EXCLAMATION_MARK |
| 08720326045470 | 8717600000003 | 35f935df60e9670778ccdefc38d13e3c1abbae529cb7820cedfd5c74f08320ab_converted.png | 500 / niet beoordeelbaar |
| 08720326045470 | 8717600000003 | be2d58979e88dc43a0d6415b67c613b1878b942492b9e92d1fa063996a9076ba_converted-0.png | 500 / niet beoordeelbaar |
| 08721516201096 | 8719189416008 | 0edd6466b34f6ae2a8a561840fb39e273e3e8a128b55f2209c9ea60cc2f0cd15_converted-0.png | 200 / EXCLAMATION_MARK |
| 08721516201096 | 8719189416008 | e0be662abd8c1bf86cf6f41aa2369f3dc5a5e034bd43fada59d6797f76cd5815_converted-0.png | 200 / EXCLAMATION_MARK |
| 08721516201119 | 8719189416008 | 37eb16f8a4942783794d283b1ca33f0f7dff11aed037a37c3de26684433760ae_converted-0.png | 200 / EXCLAMATION_MARK |
| 08721516201133 | 8719189416008 | 445c86985baafa14b5375b1992de11428608507e8f45f21691a2eb30e326eee0_converted-0.png | 200 / EXCLAMATION_MARK |
| 08721516201133 | 8719189416008 | 6ab865c36f3b49e3f78adf0ae4c5a9a72bc4fb69b1a2c7a16f67c5fb47d9d3db_converted-0.png | 200 / EXCLAMATION_MARK |
| 08721516201157 | 8719189416008 | 591a1177cebe3ef188f1f18782338eb03494f6e99793424cfa4606343da1a6db_converted-0.png | 200 / EXCLAMATION_MARK |
| 08858702401265 | 8718868145000 | 132b0a97399bc07a194d1514e11a81e41ffb9a960458a27c6521155d3a81c90c_converted-0.png | 200 / geen GHS-tag |

**VERIFIED:** 14 read-only catalog-GETs, vier tegelijk, 12 seconden timeout per request; 13 HTTP200, één HTTP500 (08720326045470). Zes GTINs bij twee GLNs declareren EXCLAMATION_MARK. Exact requestvorm: `https://catalog.stage.xxtract.com/api/tradeitemxml/{GLN}-{GTIN}-528`, bestaande API-key uitsluitend uit appcontaineromgeving; geen credential opgeslagen. XML-body niet opgeslagen; exact local-name `gHSSymbolDescriptionCode` met namespaces/taggrens gelezen. Geen-GHS-tag is geen beeldnegatief; één 500 is onbekend, niet afwezig.

**VERIFIED:** de opgeslagen volledige 654-samplemeting is opnieuw via `resultaat.samples` uitgelezen: geen canonieke GHS-code of nummeralias. De eerdere 91/74 lokale tellingen zijn daarmee geen volledige corpusclaim.

**INFERENCE:** de zes declaratiepositieve producten vormen concrete ontwikkelzoekpunten. De vier GTINs van GLN8719189416008 en de twee van GLN8710552001005 kunnen gedeelde etiketfamilies zijn; maximaal zes kandidaat-GTINgroepen betekent niet zes onafhankelijke families. Variant-/near-duplicatecontrole en menselijke annotatie blijven nodig. Deze verkenning is expliciet geen verzegelde eindholdout.

## Uploadstatus en originele herkomst

**VERIFIED:** aanvullende SELECT op `a.media_id,a.status,split_part(a.source_location,'?',1) AS origin` met dezelfde join/filters retourneerde 20 importrecords voor de 17 bovenstaande unieke storagepaths. Alle 20 hebben status `imported`. Exact dezelfde pagina kan via meerdere mediaIds en target markets voorkomen; dit mag geen onafhankelijke sample worden.

```sql
SELECT DISTINCT a.gtin,a.gln,a.media_id,a.status,a.storage_path,
       split_part(a.source_location,'?',1) AS origin
FROM artwork_imports a JOIN artwork_review_items r ON r.gtin=a.gtin
WHERE r.t3777_code IN ('AISE_2020_BRAND','AISE_2020_COMPANY',
                       'CRUELTY_FREE_PETA','ECARF_SEAL')
ORDER BY a.gtin,a.storage_path LIMIT 30;
```

Concrete GHS-declaratiepositieve PDF-herkomst; combineer onderstaande map met bestandsnaam uit de tabel, vervang `_converted-0.png` door `.pdf`:

| GTIN | mediaId(s) | Originele map |
|---|---|---|
| 03665468402253 | prodmedia-38744 / prodmedia-38745 | /8710552001005/PACKAGING_ARTWORK/1111111/03665468402253/056/ respectievelijk /528/ |
| 08720065008866 | prodmedia-37533 | /8710552001005/PACKAGING_ARTWORK/1111111/08720065008866/528/ |
| 08721516201096 | prodmedia-35479 / prodmedia-35478 | /8719189416008/PACKAGING_ARTWORK/223229/ |
| 08721516201119 | prodmedia-35477 | /8719189416008/PACKAGING_ARTWORK/223226/ |
| 08721516201133 | prodmedia-35474 / prodmedia-35475 | /8719189416008/PACKAGING_ARTWORK/223223/ |
| 08721516201157 | prodmedia-35476 | /8719189416008/PACKAGING_ARTWORK/223220/ |

**VERIFIED:** eerste MinIO-batch via ML-containeromgeving timeoutte na 55s, zonder bronbestanden te schrijven. Uitsluitend niet-geheime endpointconfig uitgelezen: MINIO_ENDPOINT=localhost, MINIO_PORT=9000. Een afzonderlijke read via geverifieerde MinIO-container-DNS, met connect3s/read8s/retries0, gaf MaxRetryError. Geen infrastructuur onderzocht of aangepast; geen claim dat objecten afwezig zijn. De lege eigen tijdelijke repositorymap is verwijderd. Een beperkte `/proc`-controle daarna vond geen resterend `/opt/venv/bin/python -`-proces van de probes. Bron-PDFs worden via de bestaande mediaserver-downloadroute apart gecontroleerd; geen MinIO-credentials opgeslagen.

## Behouden originele bronbestanden buiten git

**VERIFIED:** alle acht PDF-bronbestanden van de zes GHS-declaratiepositieve GTINs zijn via bestaande `https://media.stage.xxtract.com` bronpaden gedownload: 8/8 HTTP200, iedere PDF begint met `%PDF`, berekende SHA256 matcht exact de volledige hash in de originele importbronbestandsnaam, en de lokaal teruggelezen bytes matchen dezelfde hash. Geen transportcredentials nodig. Bestanden liggen uitsluitend onder `/tmp/logo-ghs-source-pilot-20261002`; 16574208 bytes totaal. Geen import, referentie of training uitgevoerd. Gebruik is interne ontwikkelverkenning op bestaande projecttoegang; dit geeft geen nieuw extern hergebruikrecht.

| Lokaal bestand onder genoemde scratchmap | Bytes | Pagina’s | SHA256 |
|---|---:|---:|---|
| 03665468402253__a4eef657774e.pdf | 3699986 | 1 | `a4eef657774e0fb52f010cc60031afa0f84b54beb20422cd60534a162d73d200` |
| 08720065008866__43edd9e0ee0e.pdf | 3166282 | 1 | `43edd9e0ee0e69a42d8e5f34fd003ff56d311a43b9406d2cb0f62da79299bcde` |
| 08721516201096__0edd6466b34f.pdf | 1275641 | 1 | `0edd6466b34f6ae2a8a561840fb39e273e3e8a128b55f2209c9ea60cc2f0cd15` |
| 08721516201096__e0be662abd8c.pdf | 1457853 | 1 | `e0be662abd8c1bf86cf6f41aa2369f3dc5a5e034bd43fada59d6797f76cd5815` |
| 08721516201119__37eb16f8a494.pdf | 2201711 | 1 | `37eb16f8a4942783794d283b1ca33f0f7dff11aed037a37c3de26684433760ae` |
| 08721516201133__445c86985baa.pdf | 1266422 | 1 | `445c86985baafa14b5375b1992de11428608507e8f45f21691a2eb30e326eee0` |
| 08721516201133__6ab865c36f3b.pdf | 1350156 | 1 | `6ab865c36f3b49e3f78adf0ae4c5a9a72bc4fb69b1a2c7a16f67c5fb47d9d3db` |
| 08721516201157__591a1177cebe.pdf | 2156157 | 1 | `591a1177cebe3ef188f1f18782338eb03494f6e99793424cfa4606343da1a6db` |

**VERIFIED:** eerste twee PDFs hebben optionele PDF-laaggroepen (OCG). 03665468402253: Artwork, White, Trim, Cutter, Misc info alle standaard ON, geen OFF. 08720065008866: Background, Artwork, White, Trim, Cutter, Misc info ON; uitsluitend Info-framework OFF. De zes overige PDFs bevatten geen OCProperties. Alleen metadata gelezen, geen PDF gewijzigd of verborgen laag als oplossing aangenomen.

**VERIFIED:** root heeft de volledige standaardrender van de eerste twee PDFs bekeken en meldt technische stans-/druklaagtekeningen zonder zichtbaar GHS. Dit is een voorlopige AI-waarneming, geen menselijke annotatie. Deze bestanden tellen niet als positieve waarheid, niet als normale negatieve etiketten en niet als minimum-/holdoutbewijs. De metadata bewijst niet dat Artwork standaard verborgen is; oorzaak van deze renderbeperking is niet onderzocht. Vier andere GTINs hebben WARNING/Waarschuwing in geëxtraheerde PDFtekst; ook dat is geen zichtbare GHS-waarheid. Volledige visuele beoordeling van deze andere bestanden blijft bij root/annotator.

**INFERENCE:** de acht PDFs bieden nu concrete, controleerbare ontwikkelinput. Voor zes GTINs kunnen er minder dan zes onafhankelijke artworkfamilies zijn. Groepeer alternatieven van 01096/01133 samen en beoordeel merk-/variantfamilies over GTINs voordat onafhankelijkheid wordt geteld. Geen van deze blootgestelde ontwikkelkandidaten wordt verzegelde eindtest. Alle negen klassen blijven zonder bewezen 20 leesbare onafhankelijke eindgroepen; EXCLAMATION_MARK-declaratie is uitsluitend een zoekprior.

Cleanup: lege eigen candidate-repositorymap verwijderd; alle lokale download/SELECT/probeprocessen afgerond. Na timeout geen resterend stdin-Python-probeproces in ML-container gevonden. Acht bron-PDFs blijven bewust in scratch voor rootbeoordeling, evidencebestand blijft duurzaam. Geen credentialoutputs, remote bestanden, server-/containerwijzigingen, databasewrites, tests, training, Git-acties of externe publicatie.

## Tweede zelfstandige AI-ontwikkelbeoordeling — 2026-10-02T20:55:45.960607+00:00

**VERIFIED:** deze reviewer heeft alle acht bestaande volledige PNG-previews zelfstandig visueel bekeken. Geen detectorvoorspellingen, `exploratory-predictions.json` of voorgestelde modelboxes gelezen als waarheid. Root heeft dezelfde acht pagina’s apart bekeken en rapporteert dezelfde 4/2/2-verdeling. Dit zijn twee voorlopige AI-beoordelingen, geen menselijke goedkeuring en geen verzegelde holdout.

Coördinaten hieronder zijn handmatig visueel geschatte volledige-symboolboxes `(x,y,width,height)` in de originele PNG-pixelruimte (linksboven `(0,0)`), niet detectoroutput. Bij grote pouchpreviews is teruggeschaald vanaf de getoonde volledige pagina. Marges zijn benaderingen en vragen later een nauwkeurig gecontroleerde menselijke box; er is geen detectoraccuracy/IoU berekend op deze annotaties.

| Preview | Originele PDF | PNG-afmetingen | Voorlopige pagina-uitkomst | Visuele klasse | Geschatte box | Waarneming |
|---|---|---|---|---|---|---|
| 03665468402253-page1.png | 03665468402253__a4eef657774e.pdf | 4299×2186 | technisch | geen positief GHS-label | — | Stans-/druklaagtekening; lege panels en druktechnische roodlijnen. |
| 08720065008866-page1.png | 08720065008866__43edd9e0ee0e.pdf | 3606×2274 | technisch | geen positief GHS-label | — | Stans-/druklaagtekening; SUBSTRATE/FOIL-druklogo is geen GHS-pictogram. |
| 08721516201096-page1.png | 08721516201096__e0be662abd8c.pdf | 1754×1396 | geen zichtbaar GHS | geen op deze pagina | — | Marcel’s Green Soap mandarin/osmanthus flesfront; andere recycling/vegan/microplastic-logo’s zichtbaar. |
| 08721516201096-page1-variant.png | 08721516201096__0edd6466b34f.pdf | 1754×1396 | zichtbaar GHS | EXCLAMATION_MARK / GHS07 | (409, 966, 135, 135) | Flesachterkant: één zwart uitroepteken met punt binnen volledige rode ruit, links naast waarschuwing. |
| 08721516201119__37eb16f8a494-page1.png | 08721516201119__37eb16f8a494.pdf | 3073×3379 | zichtbaar GHS | EXCLAMATION_MARK / GHS07 | (1760, 1810, 142, 142) | Mandarin/osmanthus refillpouch: voor- en achterpaneel samen, één kleine rode uitroeptekenruit links onder in rechter/achterpaneel. |
| 08721516201133__445c86985baa-page1.png | 08721516201133__445c86985baa.pdf | 1754×1396 | zichtbaar GHS | EXCLAMATION_MARK / GHS07 | (409, 966, 135, 135) | Amber/ylang-ylang flesachterkant: één uitroeptekenruit, dezelfde layoutpositie. |
| 08721516201133__6ab865c36f3b-page1.png | 08721516201133__6ab865c36f3b.pdf | 1754×1396 | geen zichtbaar GHS | geen op deze pagina | — | Amber/ylang-ylang flesfront, recycling/vegan/microplastic-logo’s; geen gevarenruit zichtbaar. |
| 08721516201157__591a1177cebe-page1.png | 08721516201157__591a1177cebe.pdf | 3073×3379 | zichtbaar GHS | EXCLAMATION_MARK / GHS07 | (1760, 1810, 142, 142) | Amber/ylang-ylang refillpouch: één uitroeptekenruit in rechter/achterpaneel. |

PNG-identiteit (SHA256):

- `03665468402253-page1.png`: `4ee1384a7cdea7d7eaf09f8f8b1ada1540382f5f24c66ea1bf9c0f847e488725`
- `08720065008866-page1.png`: `5e725f177517fd4271ff086e15935d23969edc1fcd5a252c952df988eb1d018b`
- `08721516201096-page1.png`: `a3e5fa3e79ec56153fddeefd6b6280b73b997a5ebe76a72907a6e23160f9878b`
- `08721516201096-page1-variant.png`: `f9a8d9952735ce069e86daf062c3cafd25dd4193a6addc4895d1ba8e7123d1b0`
- `08721516201119__37eb16f8a494-page1.png`: `8999c34da554cf8137fb271beda87ad875c4d0f2e1c4920632a473c7916e40cb`
- `08721516201133__445c86985baa-page1.png`: `d473ab1c8c9447cf3e6caf7aa8450e1beacc8dfbbfe8fdb6674f53246ea2f89a`
- `08721516201133__6ab865c36f3b-page1.png`: `f28a4a0fa35c82a9bd7bb068af0576afec6f9cea40aade0d1a2ab98ddd8aea94`
- `08721516201157__591a1177cebe-page1.png`: `2777242a5b126280330b2568a94ba038912357faf46288ed95a4ecb625cbc476`

**VERIFIED:** root bevestigde de uitgevoerde renderkoppeling voor de twee verkort benoemde 01096-previews: `e0be662abd8c.pdf → page1.png` (front) en `0edd6466b34f.pdf → page1-variant.png` (back). De vier laatste previews dragen hun bron-PDFhash al in de bestandsnaam. PNGs zijn previews van geïmporteerde artwork-PDFs, geen foto’s van fysieke verpakkingen.

**INFERENCE:** alle vier visuele positieve pagina’s zijn één zeer verwante Marcel’s Green Soap universeel-wasmiddel-layoutfamilie: twee geuren (mandarin/osmanthus en amber/ylang-ylang), flesback versus refillpouch. Conservative splits: behandel deze hele variantencluster als één ontwikkelfamilie totdat onafhankelijkheid anders is onderbouwd. De twee frontpagina’s zijn pagina’s zonder zichtbaar GHS binnen dezelfde GHS-positieve verpakking; zij bewijzen geen productafwezigheid en tellen niet als onafhankelijke negatieve eindtestfamilies. De technische tekeningen zijn niet-classificeerbare artworkinputs, geen reguliere negatieve etiketten.

Bewijsgrens: vier voorlopige GHS07-beeldannotaties, nul menselijk goedgekeurde labels, nul onafhankelijke final-holdoutgroepen, nul voorbeelden voor de overige acht visuele klassen. Geen trainingsclaim. Volgende stap is de ontwikkelboxes/provenance door een menselijke beoordelaar bevestigen en prospectief andere echte bronfamilies/klassen verzamelen. Alleen dit eigen inventoryappend geschreven; geen productcode, originele PDF/PNG, model, database of detector gewijzigd; geen nieuwe live calls of testrun in deze tweede beoordeling. Alle eigen processen afgerond.
