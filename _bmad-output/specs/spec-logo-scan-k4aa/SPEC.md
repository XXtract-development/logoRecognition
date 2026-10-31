---
id: SPEC-logo-scan-k4aa
companions:
  - ontwerp.md
  - ../../planning-artifacts/spike-architectuurkeuze-logoherkenning/BESLISRAPPORT.md
  - ../../planning-artifacts/spike-architectuurkeuze-logoherkenning/meetopzet.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Scanroute K4-aa voor logoherkenning

## Why

In de spike vond de huidige route (B0) vóór adjudicatie 20 van 161 top-15-paren (12%), K4-aa (Gemini 3.8 Flash vindt en benoemt, SigLIP 2 bevestigt) 144 van 161; na AI-adjudicatie vond K4-aa 144 van 158 en haalde voorlopig 7 keurmerken (BESLISRAPPORT §1, §8). Deze route moet naast de bestaande komen, per omgeving aan te zetten, zodat ACC hem op echte scans kan beproeven zonder bestaande afnemers (n8n, AI-Service) te raken.

## Capabilities

- **CAP-1**
  - **intent:** Beheerder kiest per omgeving welke scanroute de logo-scan gebruikt (`LOGO_SCAN_ROUTE=k4aa|legacy`, standaard `legacy`).
  - **success:** Zonder variabele of met een onbekende waarde draait de bestaande route ongewijzigd (bestaande tests groen); met `k4aa` loopt de scan via de nieuwe route en blijft het antwoord geldig tegen `logoResults.v1.json` (sha256 ongewijzigd `3a9cb34e…`). De route wordt bij de aanvraag vastgelegd: wisselt de variabele terwijl een scan in de wachtrij staat, dan draait die scan nog op de route van zijn aanvraag (toets).
- **CAP-2**
  - **intent:** Het systeem vindt en benoemt top-15-keurmerken met Gemini 3.8 Flash precies zoals spike-variant K1a.
  - **success:** Toetsen bewijzen: vensters = heel etiket + `tile_windows(w, h, 6)`; elk venster verkleind zoals `fb_common.jpeg_b64` (≤1500 px, INTER_AREA, JPEG q85); sha256(instructie + "||" + tegeltekst) = `6d06a808…`, sha256(`json.dumps(schema, sort_keys=True)`) = `a44b588b…`, sha256(vastgelegd referentieblad) = `d39f1905…` (uit `fase-b/bevroren.json`); per venster (via een nep-transport) systeemtekst met tegeltekst alleen voor tegels, beeldvolgorde [blad, venster], model letterlijk `google/gemini-3.8-flash`, temperatuur 0, reasoning effort minimal; vakken in etiketpixels; `ander` en vakloze meldingen vallen weg; nul meldingen = `ok` met lege lijst.
- **CAP-3**
  - **intent:** Een vak met code X blijft alleen staan als SigLIP 2 B/16-384 X bij zijn drie hoogst scorende verschillende soorten zet tegen de actieve referenties (K4-xy-regel, meetopzet §2); daarna worden meldingen van dezelfde code met IoU ≥ 0,5 samengevoegd (ketens; het eerst teruggegeven lid blijft).
  - **success:** Toetsen met vaste embeddings: code op plek 3 blijft, code op plek 4 valt weg, dubbele soorten tellen één keer; samenvoegen geeft hetzelfde als `tel.py samenvoegen` met score 0 en volgorde (venster, plek in het antwoord), ook als een later lid een hogere zekerheid heeft. Elke actieve referentie stemt mee: ontbreken er hoogstens 8 SigLIP-embeddings, dan worden die tijdens de scan in het geheugen berekend; ontbreken er meer, dan faalt de scan met `siglip_references_incomplete`.
- **CAP-4**
  - **intent:** Alleen WEIDEMELK, MARINE_STEWARDSHIP_COUNCIL_LABEL, RAINFOREST_ALLIANCE_PEOPLE_NATURE, FOREST_STEWARDSHIP_COUNCIL_MIX, BETER_LEVEN_1_STER, VEGAN_SOCIETY_VEGAN_LOGO en EUROPEAN_V_LABEL_VEGAN komen als bruikbaar voorstel uit deze route; andere codes komen terug als twijfelachtig; niets wordt automatisch.
  - **success:** In het antwoord heeft elk K4-aa-item `uitkomststand` `voorstel` met reden `route_k4aa_niet_gevalideerd`; items buiten de 7 hebben daarnaast reden `twijfelachtig`, items van de 7 niet; met een omzettabel die de soort op `automatisch` zet blijft een K4-aa-item `voorstel` (toets met ingespoten tabel). Codes die de productcategorie uitsluit vallen weg, zoals in `legacy`.
- **CAP-5**
  - **intent:** Klantartwork gaat alleen naar aanbieders zonder bewaring.
  - **success:** Elke OpenRouter-aanroep van deze route draagt `provider: {"zdr": true, "data_collection": "deny"}` (toets op de verstuurde body); de route weigert (`provider_unavailable`) als de basis-URL niet `https://openrouter.ai/api/v1` is; antwoordt OpenRouter 404 (geen aanbieder die aan de eis voldoet), dan faalt de scan met `stap1.fout = no_zdr_provider`, zonder herhaling en zonder aanroep zonder die eis (toets); 401/403 → `provider_auth`, 402 → `provider_payment`, overige 4xx → `provider_rejected`, nooit herhaald. Sleutel, beeld, prompt en antwoordtekst komen in geen enkele logregel (toets).
- **CAP-6**
  - **intent:** Een scan hergebruikt nooit een resultaat van de andere route.
  - **success:** Toets: na een `done`-scan in `legacy` geeft dezelfde aanvraag in `k4aa` een nieuwe scan (en omgekeerd); twee keer `k4aa` geeft `deduplicated`, ook met een productcategorie. Waarden: `logo_scans.model_version` = `<LOGO_MODEL_VERSION>/k4aa@<commit>` (legacy ongewijzigd `<LOGO_MODEL_VERSION>@<commit>`), `logoResults.modelVersion` = `<LOGO_MODEL_VERSION>/k4aa`, ook bij een mislukte K4-aa-scan; zonder geldige commit geen hergebruik (zoals nu).
- **CAP-7**
  - **intent:** SigLIP 2-embeddings van de actieve referenties worden opgebouwd en bewaard naast de bestaande EfficientNet-B0-embeddings, niet in plaats daarvan.
  - **success:** Eigen tabel `reference_embeddings_siglip2` (migratie + Prisma-model geschreven, niet toegepast op ACC/productie); een synchronisatie voegt alleen ontbrekende of verouderde embeddings toe (sleutel referentie + model, opnieuw bij ander opslagpad) en wist nooit; `reference_embeddings` blijft onaangeroerd (toets); ontbreekt de tabel, dan faalt een K4-aa-scan met `siglip_references_missing` terwijl localize/classify gewoon antwoorden (toets).
- **CAP-8**
  - **intent:** De gebouwde route doet lokaal hetzelfde als de spike en meldt per scan wat hij kostte.
  - **success:** Lokale run op de eerste 20 etiketten van `voorlopige-selectie.json` (bestandsvolgorde): (a) de poort op de spike-K1a-vakken van run 1, met de embeddings van de spike-momentopname, geeft dezelfde behoud/weg-beslissing als `ruw/k2a-op-k1a/run1` (verschil alleen toegestaan bij een cosinusgelijkstand ≤ 1e-5 op de top-3-grens); (b) de volledige route tegen spike K4-aa run 1: een melding telt als gelijk bij zelfde code en IoU ≥ 0,5; de route wijkt in beide richtingen niet meer af dan de spike van zichzelf (aandeel route-in-run 1 ≥ aandeel run 2-in-run 1, en aandeel run 1-in-route ≥ aandeel run 1-in-run 2, zelfde 20 etiketten). Deze norm is ná de meting aangepast, met akkoord van Friso (31-10-2026): de eerdere norm van ≥ 90% haalt de spike tegen zichzelf ook niet. Telregel: die van het vergelijkscript (een melding telt als gevonden als een melding met dezelfde code IoU ≥ 0,5 heeft; meerdere koppelingen toegestaan), voor beide metingen. Uitslag 31-10: route 21/23 en 21/27, spike run 2 tegen run 1 22/25 en run 1 tegen run 2 23/27, dus **niet gehaald** (2 meldingen op 27). **Ontheffing Friso, 31-10-2026:** het verschil past bij de wisselvalligheid van Gemini; de echte kwaliteitstoets is de latere validatie door een mens op nieuwe etiketten; aanbieder per aanroep vastgelegd. Per scan staan aanroepen, tokens, kosten (opgeteld over alle pogingen; `null` als onbekend) en aanbieders in `stap1` (toets).

- **CAP-9**
  - **intent:** De ml-service op ACC krijgt genoeg geheugen om de route tijdens proeven te draaien zonder dat werkers uitvallen.
  - **success:** In `docker-compose.acc.yml` staat bij ml-service `deploy.resources.limits.memory: 12G` (was 8G); reservering (2G) en `docker-compose.prod.yml` (8G) ongewijzigd (toets). Onderbouwing: ACC-host 30 GB, 11 GB vrij (Friso, `free -g` op vanilla, 31-10); ml-service nu 6,57/8 GiB met 3 werkers van 1,52/2,70/2,29 GB; SigLIP kost lokaal ±0,8 GB per werker → ±9 GB met de route aan.

## Constraints

- ml-service-container op ACC heeft 12 GB (CAP-9; was 8 GB) met tot 4 werkers: SigLIP laadt alleen de beeldtoren, één keer per werker (achter een slot), pas bij het eerste K4-aa-verzoek; `legacy` en het opstarten laden hem nooit. Norm: 4 × RSS van een werker met B0 + SigLIP na één K4-aa-scan ≤ 7 GB, lokaal gemeten, nooit in de live container. Op ACC geldt daarnaast de limiet van 12G (CAP-9), omdat werkers daar in de loop van de tijd tot 2,7 GB groeien. De route staat standaard op `legacy` en gaat alleen aan tijdens proeven (besluit Friso 31-10).
- Bestaande afhankelijkheden blijven gepind (torch 2.1.2, transformers 4.38.2); geen upgrade voor SigLIP (VERIFIED: `SiglipVisionModel` laadt de checkpoint en geeft cosinus 1,000000 tegen de spike-embeddings).
- Gewichten en beeldvoorbewerking zitten in het image (bouwstap), buiten `/app/models`; `HF_HUB_OFFLINE=1`; geen download tijdens een scan.
- Tijdsbudget: ml-aanroep ≤ 165 s (validatie ml-service), scan ≤ 240 s (`LOGO_SCAN_MAX_MS`); 20 s blijft vrij voor de SigLIP-stap; hoogstens 64 uitsneden per scan. Spike: ±$0,012 en mediaan ±7–8 s per etiket (K4-aa run 1/2: $0,0123/$0,0115; 8,0/7,4 s; p90 16,0/11,6 s).
- Sleutel alleen uit de omgeving (`GHS_REVIEW_API_KEY`), nooit in log, bestand of antwoord; logs bevatten geen beeld, prompt of antwoordtekst.
- Geen klantbeelden in repo of testfixtures.
- Migraties worden geschreven, niet toegepast; code moet zonder de nieuwe tabel opstarten en `legacy` bedienen.

## Non-goals

- GHS-symbolen en keurmerken buiten de top 15: de K4-aa-route levert ze niet (de legacy-route blijft daarvoor).
- Een keurmerk op `automatisch` zetten; validatie op door een mens bevestigde etiketten.
- Verbeteren van vakprecisie, Groene Punt of Recyclebaar.
- Een getraind model of kalibratie van drempels.
- Uitrol, migratie toepassen (doet de hoofdsessie na de merge) of Coolify-instellingen; de productielimiet in `docker-compose.prod.yml`.

## Success signal

- Met `LOGO_SCAN_ROUTE=k4aa` geeft de bestaande scan-API voor een etiket een schema-geldig antwoord met de K4-aa-meldingen, die op de ±20 lokale meetsetetiketten nagenoeg gelijk zijn aan de spike-uitvoer K4-aa; zonder de variabele verandert er voor afnemers niets.

## Assumptions

- Afnemers mogen in `k4aa` minder GHS/staartcodes krijgen; de schakelaar staat standaard op `legacy`.
- `GHS_REVIEW_BASE_URL`/`GHS_REVIEW_API_KEY` wijzen op ACC naar OpenRouter (zelfde sleutel als de spike).

## Open Questions

- Mag de K4-aa-route op ACC aan vóórdat GHS en de lange staart erin zitten, of moet hij dan de legacy-route ernaast blijven draaien? (standaard nu: niet ernaast)
- OpenRouter-accountinstellingen (logging/training) zijn alleen via het dashboard te controleren — door Friso.
