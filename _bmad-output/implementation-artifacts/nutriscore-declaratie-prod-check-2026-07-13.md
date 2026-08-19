# Nutri-Score-letter in productie-declaratie — haalbaarheidscheck voor Friso's grondwaarheid-route

Datum: 2026-07-13 · **read-only** (mongodb-prod `application`, geen writes/registratie). Doel: kan de Nutri-Score-**letter** (A–E) per product uit de productie-data worden gehaald + het bijbehorende etiket, als grondwaarheid voor C/D?

## Verdict: **HAALBAAR — Friso heeft gelijk** (met één open punt: exacte C/D-dekking niet read-only telbaar in deze omgeving)

De letter is per product gedeclareerd in een **apart GDSN-veld** (niet het letterloze keurmerk-veld), en het bijbehorende product-etiket is via een directe media-URL ophaalbaar. Dit is een echte grondwaarheid-bron. Het enige wat ik niet read-only kon vaststellen is het **exacte aantal C/D-producten** — dat vergt een kleine extractie (zie onder).

---

## 1. Het veld met de Nutri-Score-letter — GEVONDEN

Uit de veld-dictionary (`search_fields`) van het GS1-Benelux-datamodel:

| GDSN-veld | nlName | index/tab |
|-----------|--------|-----------|
| **`nutritionalScore`** | "Score Voedingsprogramma" | Keurmerken & logo's (service: Label) |
| `nutritionalScoreProductCategoryCode` | "Nutri-Score product categorie" | idem |

**Dit is een ANDER veld dan het letterloze `packagingMarkedLabelAccreditationCode` (GENERAL_FOODS)** dat de eerdere "letterloos"-investigation vond. Die investigation keek naar het *keurmerk*-veld; Friso's intuïtie klopt dat de letter elders als *waarde* staat.

- **Waarde-bereik bevestigd A–E:** de `nutritional_changelog` toont echte producten met `nutritionalScore` gezet op **B** en meermaals **E** (bv. GTIN `08710624768478` → E), op paden binnen `nutritionalInformationModule` (het GDSN-nutritionalProgram-blok).
- **Locatie:** de waarde leeft in `nutritionalInformationModule` (nutritionalProgram → `nutritionalScore`), `value` ∈ {A,B,C,D,E}. De exacte array-index verschilt per product (afhankelijk van het aantal nutriënten in het template).

## 2. Etiket / artwork ophaalbaar — BEVESTIGD

Hetzelfde product (`8719331259583-08710624768478-528`, nutritionalScore=E) draagt een `referencedFileDetailInformationModule` met:
- `referencedFileTypeCode` = **PRODUCT_IMAGE**, `isPrimaryFile` = TRUE
- `fileName` = `08710624768478_A1N1.tiff`, 2400×2400, RGBA, 300 PPI
- **`uniformResourceIdentifier`** = directe media-URL (`https://gdsnprodwebstorage.blob.core.windows.net/gdsnprodnlwebfileblob/8719331259583/08710624768478/528/Media/40867100/08710624768478_A1N1.tiff`)

Dus per product met een gedeclareerde letter is het **packshot/etiket direct ophaalbaar** via de GDSN-media-URL in de tradeItem zelf (naast de bekende prod `/media/Xmedia`-opslag per GLN). Letter + etiket komen samen uit dezelfde tradeItem.

## 3. Dekking per letter (C/D) — NIET read-only telbaar in deze omgeving

Ik kon het aantal producten per letter **niet** exact tellen. Redenen (alle drie tegelijk):
1. **Genest form-model met variabele array-diepte.** `nutritionalInformationModule` is een array-van-arrays (`group[[...]]`, `fields[[...]]`); de `nutritionalScore`-waarde staat per product op een andere index. MongoDB dot-notatie kan dubbel-geneste arrays zonder vaste index niet doorlopen (alle path-queries → 0).
2. **Server-side JS uitgeschakeld.** `$function`/`$where` (waarmee ik recursief de waarde zou extraheren) zijn geblokkeerd op deze cluster.
3. **Geen Atlas `$search`** (geen full-text index) en **geen werkende catalog-XML-key** vanaf de infra (prod-catalog onbereikbaar, stage 401; de gevonden container-key is voor OCR, niet catalog).
- De `nutritional_changelog` (219k records) vangt alleen **handmatige** edits — slechts 5 nutritionalScore-wijzigingen (1×B, 4×E). GDSN-geïmporteerde waarden lopen daar niet doorheen, dus dit is géén dekkingsmaat.

**Wat de kleinste vervolgstap is om C/D wél te tellen** (geen read-only query maar een kleine extractie):
- **Optie A (aanrader):** lees de veldwaarde uit het **GDSN-XML-importpad** — daar is `<nutritionalScore>A..E</nutritionalScore>` een schoon element (de bestaande catalog/import-pipeline parseert dit al). Een gerichte extractie over de **159.860** tradeItems levert direct de A–E-verdeling + de media-URL per product.
- **Optie B:** een eenmalig extractiescript met server-side JS tijdelijk aan, of een recursieve walk in de app-laag (Node/Prisma buiten Mongo), dat per tradeItem `meta.gdsn=='nutritionalScore'` → `value` verzamelt.

Beide zijn kleine, gerichte klussen; ze vallen buiten "read-only SELECT".

---

## Samenvatting verdict

| Vraag | Antwoord |
|-------|----------|
| (a) Letter per product gedeclareerd, in welk veld? | **JA** — GDSN `nutritionalScore` ("Score Voedingsprogramma"), waarde A–E; apart van het letterloze GENERAL_FOODS-keurmerk |
| (b) Genoeg C/D-producten? | **Onbekend read-only** — exacte telling geblokkeerd (geneste schema + JS uit + geen catalog-key). Veld is aantoonbaar gevuld (B/E gezien); C/D-volume vergt een korte extractie |
| (c) Etiket ophaalbaar? | **JA** — `referencedFileDetailInformationModule` → PRODUCT_IMAGE met directe media-URL (hi-res TIFF), per product met de declaratie |
| **Route haalbaar?** | **JA, mechanisme bewezen** — letter + etiket komen samen per product; superieure grondwaarheid t.o.v. de noisy 12.12-vorm-oogst. Enige actie vooraf: de A–E-dekking (m.n. C/D) extraheren om te bevestigen dat er genoeg C/D-producten zijn |

**Aanbeveling:** bouw een gerichte extractie (optie A) die over alle tradeItems de `nutritionalScore`-waarde + de PRODUCT_IMAGE-URL oogst, gefilterd op C en D. Dat geeft in één run zowel de dekking (hoeveel C/D) als de kant-en-klare (letter, etiket-URL)-paren om als grondwaarheid-referenties te gebruiken — zonder het noisy vorm-oogsten.

*Read-only op mongodb-prod `application`; geen writes/registratie. Totaal tradeItems: 159.860. Catalog-XML-API niet bereikbaar met beschikbare keys.*
