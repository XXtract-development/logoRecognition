---
titel: 'Meting: wat staat er in onze etiketbestanden? (invoer voor route A)'
datum: 2026-10-31
status: compleet
bron: productie-mediaserver (alleen lezen, niets gekopieerd of geschreven)
steekproef: de 173 etiketten van de meetset (`voorlopige-selectie.json`), originele bestanden naast de omgezette plaatjes
waarheid: AI-labels uit de meetset (niet door een mens bevestigd)
hoort-bij: research.md, §5 en open vraag 2
---

# Meting: wat staat er in onze etiketbestanden?

**Uitkomst.** Route A (eerst het etiketbestand) helpt, maar alleen als aanvulling.
- **De verplichte codes zijn betrouwbaar:** op de etiketten zonder het keurmerk vonden we nul keer een code.
- **Ze dekken weinig:** de code is te vinden bij ongeveer een derde van de etiketten met FSC, een kwart met MSC en een zesde met EU-biologisch.
- **De helft van de etiketten heeft geen PDF als origineel**, alleen een JPG, TIFF of PNG; in het archief is het per bestand zelfs driekwart (§4). Voor die etiketten kan route A niets.

Een detector die op het beeld werkt (route D) blijft dus de hoofdroute.

> [!warning]
> De "waarheid" in deze meting is het AI-oordeel uit de meetset, niet door een mens bevestigd. De meetset is bovendien gekozen op etiketten mét keurmerken, en is dus geen willekeurige doorsnede van het archief.

## 1. Formaat van de originele bestanden (173 etiketten)

| Origineel | Etiketten |
|---|---|
| Alleen PDF | 60 |
| PDF plus een rasterbeeld (PNG, TIFF of JPG) | 26 |
| **Totaal met PDF** | **86 van 173 (50%)** |
| Alleen JPG of JPEG | 64 |
| Alleen TIFF | 19 |
| Alleen PNG, of PNG plus JPG | 4 |
| **Totaal zonder PDF** | **87 van 173 (50%)** |

**Over de 92 PDF-bestanden** (sommige etiketten hebben er meer dan één):
- **Gemaakt met:** Adobe Illustrator 39, Adobe InDesign 16, Esko Automation Engine 7, onbekend 8, overig (Word, PDFium en dergelijke) 22.
- **Tekstlaag:** 56 van de 92 bevatten een echte tekstlaag (61%); 42 van de 92 bevatten 200 tekens of meer (46%). De rest heeft de tekst omgezet naar lijnen, of bestaat uit een plaatje.
- **Afgevlakt:** 12 van de 92 bevatten een groot rasterbeeld van minstens 4 megapixel (13%). Dat zijn waarschijnlijk afgevlakte drukproeven.

## 2. Verplichte codes als signaal

Alleen etiketten met een PDF-origineel. "Met keurmerk" betekent dat de AI het keurmerk op het etiket zag.

| Keurmerk | Met keurmerk (totaal) | Waarvan met PDF | Code gevonden | Gedekt van het totaal | Code bij etiketten zónder keurmerk |
|---|---|---|---|---|---|
| FSC (vorm `FSC® C123456`) | 15 | 8 | 5 | 5/15 = 33% | 0 van 78 |
| MSC (vorm `MSC-C-12345`) | 13 | 9 | 3 | 3/13 = 23% | 0 van 77 |
| EU-biologisch (vorm `NL-BIO-01`, `DE-ÖKO-039`) | 12 | 5 | 2 | 2/12 = 17% | 0 van 81 |

- **Tweede, onafhankelijke controle van de nul treffers.** Een ruimer zoekpatroon (elke "FSC" of "MSC", elk patroon `C123456`, elke landcode-letters-cijfers) leverde bij de etiketten zónder keurmerk alleen de zin "gemaakt van FSC karton" op. Dat staat op 4 etiketten uit dezelfde productfamilie, zonder licentiecode. De nul treffers blijven dus staan.
- **Betekenis:** een gevonden code is een sterk bewijs. Een ontbrekende code zegt weinig, want de code ontbreekt bij twee derde van de etiketten mét het keurmerk.

## 3. Namen van de andere keurmerken als tekst

Bij etiketten met een PDF-origineel. Teller is het aantal etiketten waar de naam in de tekst voorkomt.

| Keurmerk | Naam in tekst, mét keurmerk | Naam in tekst, zónder keurmerk |
|---|---|---|
| Nutri-Score (A/B/C) | 0 van 10 | 0 van 76 |
| Groene Punt | 0 van 12 | 0 van 74 |
| Weidemelk | 0 van 4 | 0 van 82 |
| Zwangerschap | 0 van 3 | 0 van 83 |
| Beter Leven | 0 van 2 | 0 van 84 |
| Rainforest Alliance | 1 van 5 | 0 van 81 |
| Recyclebaar | 1 van 10 | 1 van 76 |
| Vegan (alle drie de vegan-keurmerken) | 6 van 24 | 0 van 62 |

**Betekenis:** deze keurmerken staan er vrijwel alleen als beeld op. Tekst helpt hier nauwelijks. "Vegan" in de tekst is een redelijk signaal (nul keer zonder keurmerk), maar dekt maar een kwart.

## 4. Formaten in het hele archief (productie, `PACKAGING_ARTWORK`)

Het archief staat op een netwerkschijf van ongeveer 22 TB. Een volledige telling is na 30 minuten afgebroken, dus dit is een steekproef van 25 willekeurige leveranciersmappen (GLN's). Daarvan hadden er 24 een map `PACKAGING_ARTWORK`. Omgezette plaatjes en miniaturen zijn niet meegeteld.

| Formaat van het origineel | Bestanden | Aandeel |
|---|---|---|
| PNG | 4.334 | 48% |
| JPG / JPEG | 2.427 | 27% |
| PDF | 2.308 | 25% |
| TIFF | 4 | 0% |
| **Totaal** | **9.075** (2 bestanden zonder extensie niet meegeteld) | |

- **Per bestand, niet per product.** Een product kan naast een PDF ook een PNG hebben. Het aandeel producten met een PDF ligt daarom waarschijnlijk hoger dan 25%. In de meetset was het 50% per etiket (§1).
- **Scheef verdeeld.** Twee leveranciers leveren elk ongeveer 1.600 van de 9.075 bestanden. Een paar grote leveranciers bepalen het beeld.
- **Betekenis:** in het archief is maar een kwart tot de helft PDF. Voor de rest is alleen het beeld beschikbaar.

```bash
# steekproef (alleen lezen; vast startgetal voor herhaalbaarheid)
ssh banana 'cd /media/Xmedia && for g in $(ls | shuf -n 25 --random-source=<(yes 20261031)); do [ -d "$g/PACKAGING_ARTWORK" ] || continue; timeout 90 nice -n 19 find "$g/PACKAGING_ARTWORK" -type f ! -name "*_converted-*" ! -name "*_thumbnail*" | sed -E "s/.*\.([A-Za-z0-9]+)$/\1/" | tr "A-Z" "a-z" | sed "s/^/$g /"; done'
```

## 5. Wat dit betekent voor de aanpak

1. **Route A blijft een aanvulling, geen hoofdroute.**
   - Codes zijn betrouwbaar (nul valse treffers), maar dekken 17–33% van de etiketten met FSC, MSC of EU-biologisch.
   - Voor de andere keurmerken levert tekst nagenoeg niets op.
2. **Route D (een getrainde detector op het beeld) is nodig voor elk etiket.** De helft van de etiketten heeft alleen een plaatje als origineel, en bij de PDF's ontbreekt vaak de tekstlaag.
3. **Te gebruiken in de proef:** een gevonden code mag een detectie van FSC, MSC of EU-biologisch bevestigen, of een twijfelgeval beslissen. Een ontbrekende code mag nooit een detectie afkeuren.
4. **Niet gemeten:**
   - Of de keurmerken in de PDF's als vectortekening of als ingesloten afbeelding staan. Daarvoor moet per keurmerk de plek bekend zijn; dat kan in de proef.
   - Of de Nutri-Score-letter via de vectorkleuren te lezen is. Dat werkt hooguit voor de etiketten met PDF, dus voor de helft.

## Werkwijze (herhaalbaar)

- **Wat:** per etiket de map van het origineel op de mediaserver (`/media/Xmedia/<GLN>/PACKAGING_ARTWORK/…`), afgeleid uit de ophaallijsten van de meetset. Alleen bestandsnamen, grootte en de uitvoer van `pdfinfo`, `pdftotext`, `pdfimages -list` en `pdffonts`, gedraaid met `nice -n 19`.
- **Scripts:** `meting/remote_meet.py` (eerste meting) en `meting/remote_snippets.py` (tweede, ruimere controle). Beide schrijven niets op de server.
- **Ruwe uitvoer** (bevat documentnummers en gevonden licentiecodes van klanten, en staat daarom buiten de repository): `~/logo-meetset-20261018/ontwikkelmeting-20261028/etiketmeting/` (`resultaat-173.jsonl`, `docs.jsonl`, `snippets.jsonl`).
- **Zoekpatronen** (Python `re`):
  - FSC: `FSC[®\s]*[-–]?\s*C\s?\d{6}`
  - MSC: `MSC[-–\s]*C[-–\s]*\d{5}`
  - EU-biologisch: `\b[A-Z]{2}[-–](?:BIO|ÖKO|OKO|ORG|ECO|EKO|ØKO|OEKO)[-–]\d{2,3}\b`
- **Opnieuw draaien:**

  ```bash
  B64=$(base64 < meting/remote_meet.py | tr -d '\n')
  ssh banana "nice -n 19 python3 -c \"import base64;exec(base64.b64decode('$B64'))\"" < docs.jsonl > resultaat.jsonl
  ```

  `docs.jsonl` heeft per regel `{"kaart","doc","dirs":[…],"codes":[…]}`, gebouwd uit `voorlopige-selectie.json` en de `ophaallijst.tsv`-bestanden van de meetset.
