---
id: SPEC-nutriscore-acc-test
companions: []
sources: [_bmad-output/planning-artifacts/research/nutriscore-acc-test-2026-11-24.md]
---

> **Canonical contract.** Bewuste uitzondering op de pauze van 31-10 (besluit Friso 24-11): alleen Nutri-Score, alleen ACC.

# Nutri-Score A–E testbaar op ACC

## Why

Friso wil het ACC-endpoint (`https://logo-detection.acc.xxtract.com`) met afbeeldingen kunnen aanroepen en Nutri-Score-uitkomsten A–E terugkrijgen. De oude route (`LOGO_SCAN_ROUTE` niet gezet = legacy, VERIFIED 24-11) kent alle vijf letters. Twee dingen ontbreken: een eigen toegangssleutel voor deze test, en een meting per letter op de 139 door mensen bevestigde etiketten. De bestaande sleutellijst `LOGO_PIPELINE_KEYS` is op ACC niet leesbaar via de Coolify-API (waarden worden niet teruggegeven), dus een sleutel toevoegen door de lijst te vervangen zou de koppeling `n8n-acc` wissen.

## Capabilities

- **CAP-1** (sleutel naast de bestaande lijst)
  - **intent:** Naast `LOGO_PIPELINE_KEYS` leest de API `LOGO_PIPELINE_KEYS_EXTRA` (zelfde vorm `naam:sleutel,naam2:sleutel2`). Een sleutel uit één van beide lijsten geeft toegang en levert zijn consumentnaam. Zonder de nieuwe variabele is het gedrag ongewijzigd; beide leeg = alles geweigerd (fail closed).
  - **success:** Test: (a) alleen `LOGO_PIPELINE_KEYS` gezet → oude sleutel werkt, onbekende 401; (b) beide gezet → sleutel uit elk van de twee werkt en geeft de juiste naam; (c) alleen EXTRA gezet → die sleutel werkt; (d) beide leeg of ongezet → niemand komt binnen; (e) een voorvoegsel of de gedeelde `API_KEY`/`PIPELINE_SERVICE_KEY` werkt niet; (f) een kapot item in EXTRA laat de lijst `LOGO_PIPELINE_KEYS` ongemoeid.
- **CAP-2** (meetscript)
  - **intent:** `scripts/nutriscore_measure.py` stuurt alle 352 bevestigde etiketten naar ACC en leest alleen de Nutri-Score-detecties A–E. Elke aanroep draagt `rescan=true`. De sleutel wordt nooit geprint, gelogd of weggeschreven. De run is hervatbaar: een etiket met een `done`-antwoord wordt niet opnieuw verstuurd. Uitvoering: zie Uitvoeringsnotitie.
  - **success:** Test met een nep-server: (a) sleutel verschijnt in geen enkele uitvoerregel of -bestand; (b) tweede run stuurt alleen nog ontbrekende etiketten; (c) `failed`, time-out en HTTP-fout tellen als "geen antwoord", nooit als "geen Nutri-Score"; (d) elke aanvraag draagt `rescan=true`; (e) alleen `<id>.png` wordt verstuurd, nooit een `-CODE-n`-variant.
- **CAP-3** (uitslag per letter)
  - **intent:** Waarheid = het veld `nutriscore` in `toets/uitslag.json` (status `bevestigd`; 139 etiketten met één letter: A 26, B 27, C 32, D 32, E 22; 213 zonder). Per letter L, over alleen de etiketten mét antwoord: **gevonden** = etiketten met waarheid L waarvoor `NUTRISCORE_L` gemeld is ÷ etiketten met waarheid L; **vals** = etiketten zonder waarheid L waarvoor `NUTRISCORE_L` gemeld is ÷ alle etiketten waarvoor `NUTRISCORE_L` gemeld is (aandeel meldingen dat fout is; 0 meldingen = "n.v.t.", nooit 0%). Rapporteer teller én noemer, de verwisselingsmatrix (waarheid → gemelde letter(s), "geen"), het aantal etiketten zonder antwoord, de `method` van de gemelde Nutri-Score-detecties (aantal per methode), een voorbehoud-regel dat de referentiebeelden van de oude route uit dezelfde etiketten kunnen komen (trainingsoverlap niet gemeten), en per letter of de eis (≥ 80% gevonden én ≤ 10% vals) gehaald is. Eén etiket kan meerdere letters melden; elke gemelde letter telt voor zichzelf.
  - **success:** Test op een vaste mini-set met bekende uitkomst: alle getallen, "n.v.t." bij 0 meldingen, en eis-vlag kloppen exact; een etiket zonder antwoord telt in geen teller of noemer van gevonden/vals maar wel in de regel "zonder antwoord".
- **CAP-4** (uitrol en bewijs op ACC)
  - **intent:** Na push naar `acc` en de automatische uitrol draait de nieuwe commit, werkt de oude sleutel (`n8n-acc`) nog, en werkt de nieuwe sleutel (consument `nutriscore-test`).
  - **success:** Op ACC gemeten: `/health` 200; `LOGO_PIPELINE_KEYS` in Coolify ongewijzigd (zelfde `updated_at` als vóór de actie); nieuwe sleutel geeft 202 met een `scanId` dat naar `done` gaat; zonder sleutel 401. Gevonden `method` van de Nutri-Score-detecties wordt gemeld (`nutriscore-a2` = gewichten in MinIO aanwezig). Waarde van de sleutel verschijnt nergens.

## Constraints

- Alleen ACC. Geen productie. Buiten de goedgekeurde stappen (sleutel zetten in Coolify, herstart/redeploy van Logorecognition ACC) geen schrijfacties op ACC. De meting schrijft bewust wel: één `logo_scans`-rij per aanvraag (352 etiketten, plus herhalingen).
- De sleutelwaarde komt nooit in een gesprek, bericht, bestand in de repo of logregel. Aanmaak: zie Uitrolnotitie. De nieuwe variabele vervangt niets.
- Geen wijziging aan routes, modellen, referenties of de pauze-stand van de rest van de pijplijn.
- Terugdraaien: `LOGO_PIPELINE_KEYS_EXTRA` verwijderen + herstart zet de toegang terug; de `logo_scans`-rijen blijven staan.
- Bekende beperking: de oude sleutel (`n8n-acc`) is op ACC niet te toetsen. Dat hij werkt, is afgeleid uit het onveranderd blijven van `LOGO_PIPELINE_KEYS`, niet getoetst.

## Uitvoeringsnotitie

- Sleutel: uit de omgevingsvariabele `LOGO_KEY` (kale waarde, mag `:` bevatten), anders uit de Keychain (service `LOGO_PIPELINE_KEYS_EXTRA`, account `acc`; waarde `naam:sleutel`, het script neemt het deel na de eerste `:`).
- Beeld: `toets/beelden/<id>.png`; de `-CODE-n`-varianten en `productId` gaan nooit mee.
- Aanvragen: 2 tegelijk, `POST /api/v1/pipeline/logo-scans`, daarna pollen op `GET …/:scanId` tot `done`/`failed`, max 300 s per etiket. Time-out, `failed` en HTTP-fout tellen als "geen antwoord", nooit als "geen Nutri-Score".
- Ruwe antwoorden staan per etiket in de uitvoermap buiten de repo (`--out`); fouten per etiket in `_fouten/<id>.json` (fase en statuscode, nooit de sleutel).

## Uitrolnotitie

- Sleutel aanmaken (nieuwe variabele): `coolify-set-secret generate logorecognition-acc LOGO_PIPELINE_KEYS_EXTRA 32 --formaat base64-id --id nutriscore-test --keychain acc`.

## Out of scope

K4-aa voor D/E, een eigen Nutri-Score-endpoint, het filteren aan de serverkant, train- of drempelwijzigingen, productie.
