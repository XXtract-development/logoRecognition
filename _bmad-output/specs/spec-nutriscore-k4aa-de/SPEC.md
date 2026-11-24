---
id: SPEC-nutriscore-k4aa-de
companions:
  - ../spec-logo-scan-k4aa/SPEC.md
  - ../spec-logo-scan-k4aa/ontwerp.md
sources:
  - ../../implementation-artifacts/investigations/nutriscore-acc-k4aa-meting-20261124.md
---

> **Canonical contract.** Deze SPEC en de `companions:` zijn het contract. Basis: SPEC-logo-scan-k4aa (route, windows, poort, ZDR); deze spec wijzigt alleen wat hieronder staat.

# Nutri-Score A t/m E in de K4-aa-route

## Why

Meting 24-11 op 352 etiketten (ACC, acc@869dfa1): A 92% gevonden / 21% vals, B 45%/44%, C 79%/26%, D 0/32, E 0/21. D en E zijn per ontwerp onmogelijk (codelijst kent alleen A/B/C; C-omschrijving zegt "D or E: ander"). Besluit Friso 24-11 (item 62): uitbreiden met D en E. Eis per letter: ≥80% gevonden en ≤10% vals.

## Capabilities

- **CAP-1**
  - **intent:** K4-aa kan NUTRISCORE_D en NUTRISCORE_E melden naast A/B/C.
  - **success:** Toetsen: `TOP15` bevat 17 codes met beide nieuwe; prompt-omschrijving en schema-enum bevatten ze (schema leidt uit de lijst af); de C-omschrijving bevat geen "D or E: ander" meer; de instructie krijgt één regel: "For Nutri-Score, use the code of the one enlarged letter and box the whole bar; a bar without an enlarged letter is \"ander\""; elke omschrijving van A–E noemt dat precies die letter uitvergroot is; `parse` laat D/E door. Referentieblad bevat tegels NUTRISCORE_D en NUTRISCORE_E uit de synthetische seeds (`reference-logos/NUTRISCORE_D|E`), zelfde stijl als A/B/C, 15 tegels in 4 rijen, 1440×1176 (tegels na NUTRISCORE_C schuiven één plek op, alfabetisch). Herbouwbaar: bouwer = `referentieblad()` in de spike-map (`fase-b/fb_k1.py`, Arial op macOS); het bouwscript komt in de repo naast het blad.
- **CAP-2**
  - **intent:** De poort onderscheidt Nutri-Score-letters in plaats van de hele familie door te laten.
  - **success:** Toetsen met vaste embeddings: een melding NUTRISCORE_X blijft alleen als X de hoogst scorende Nutri-Score-code is onder alle actieve referenties van het uitsnede én (bestaande regel) in de top-3 verschillende soorten staat; andere codes blijven op de bestaande regel; regel: behoud als score(X) ≥ de score van elke andere `NUTRISCORE_*` in dezelfde top-3 (gelijke score houdt beide). Vijf tests: X achter Y valt weg; X vóór Y blijft; gelijke score blijft; X op plek 4 valt weg; niet-Nutri-Score-codes ongewijzigd. Hypothese (te toetsen op de deelset, niet aannemen): top-3 laat elke letter door omdat de letters in SigLIP-ruimte dicht bij elkaar liggen.
- **CAP-2b**
  - **intent:** Eén balk geeft één letter.
  - **success:** Na de poort worden Nutri-Score-meldingen met IoU ≥ 0,5 maar verschillende letter teruggebracht tot één: die met de hoogste poortscore (toets met vaste meldingen); meldingen van dezelfde letter blijven via `merge`.
- **CAP-2c**
  - **intent:** Statistiek toont wat de letterstap wegneemt.
  - **success:** `stats.letter_dropped` = aantal meldingen dat `one_letter` weghaalt (toets); `na_poort` blijft het aantal na poort, letterstap en samenvoegen.
- **CAP-3**
  - **intent:** De gate heeft actieve SigLIP-referenties voor D en E.
  - **success:** Volgens manifest 12-07 had ACC 3 D- en 10 E-referenties; 17 van de 42 Nutri-Score-referenties toonden een andere letter dan geregistreerd (4 A = E-balk, beide echte D = B/C-balk, 3 E = Beter Leven/Halal). Gemeten op de actuele set: per letter aantal referenties, aantal met SigLIP-embedding, en een steekproef-oordeel op zuiverheid (SQL/commando in het rapport). Opschonen of embedding-sync op ACC is een schrijfactie: niet zelf doen, melden aan de orchestrator met het effect op de meting. Ontbreken er > 8 embeddings, dan faalt elke scan (`siglip_references_incomplete`): dat is een blokkade. Niets op productie.
- **CAP-4**
  - **intent:** De bewuste afwijking van de spike-pins is vastgelegd en getoetst.
  - **success:** `tests/test_k4aa_atdd.py`: pins voor `INSTRUCTIE`+`DEEL`, `SCHEMA` en `referentieblad` hebben de nieuwe sha256-waarden met een commentaarregel "bewust gewijzigd, SPEC-nutriscore-k4aa-de"; `len(TOP15) == 17`; `scripts/k4aa_vergelijk.py` volgt `TOP15`; alle overige pins (model, temperatuur, vensters, JPEG-regels, ZDR) ongewijzigd en groen. De spike-gelijkheid uit SPEC-logo-scan-k4aa CAP-2 vervalt alleen voor deze drie pins; CAP-8 (spike-vergelijking) vervalt voor deze wijziging.
- **CAP-5**
  - **intent:** Het resultaat wordt gemeten in twee stappen op ACC, zonder lek van de toetsset.
  - **success:** (a) Deelset = per letter A/B/C 15 etiketten (vaste seed 20261124) + alle D (32) en E (22) + 20 etiketten zonder Nutri-Score (213 van de 352 hebben er geen; zij meten valse meldingen); gefilterd waarheidsbestand; verse lege `--out`-map (het script hergebruikt anders oude antwoorden zonder D/E); alle antwoorden dragen modelVersion `…/k4aa`. Rapport per letter gevonden/vals met noemer, origineel en herschaald apart, plus per melding pre-poort/post-poort telling uit `stats` waar beschikbaar. (b) Volledige 352 alleen als elke letter met n ≥ 10 op de deelset ≥ 70% gevonden en ≤ 15% vals haalt; een letter met n < 10 is "te klein om te beoordelen", geen stop; anders stoppen en de oorzaak per letter benoemen met meetbewijs. (c) Prompt en codelijst zijn niet bijgesteld op basis van individuele toetsetetiketten; GTIN-overlap tussen actuele referenties en de 352 wordt gemeten en gerapporteerd (12-07: 0 van 29).
- **CAP-6**
  - **intent:** ACC is na afloop weer in de uitgangstoestand.
  - **success:** `LOGO_SCAN_ROUTE` weer verwijderd (ook preview-kopie), redeploy afgerond, `/health` 200, testscan geeft modelVersion zonder `/k4aa`; testsleutel (indien gemaakt) ingetrokken en Coolify opnieuw uitgelezen zonder de variabele; productie onaangeroerd.

## Constraints

- Geen train/test-lek: prompt, omschrijvingen en referentietegels volgen de coderegels en de synthetische seeds (`_bmad-output/test-artifacts/nutriscore-crops/*seed-synthetic*`); beelden uit `uitslag.json` worden niet als voorbeeld of referentie gebruikt.
- Alleen ACC. Geheimen nooit in gesprek, log of repo.
- NUTRISCORE_* blijft buiten `BRUIKBAAR` (uncertain, requires_review); opname is een apart besluit van Friso.
- Meetscript `scripts/nutriscore_measure.py` scoort op ruwe `detections`; waarheid `uitslag.json` (status `bevestigd`). Op 24-11 gaven 25 etiketten geen antwoord: noemers vermelden, niet wegpoetsen.
- Kosten ca. $0,012 per etiket (AANNAME uit spike); deelset ca. 125 etiketten.
- Lokaal typecheck/gerichte tests groen vóór push; push/PR naar `acc` volgens de ACC-vrijgave.

## Non-goals

- Andere keurmerken, de oude route (embedding, kleur-lezer), herschalen van etiketten, een getraind model, productie-uitrol, opname in `BRUIKBAAR`.

## Success signal

Werk afgerond: gebouwd, getest, gemeten (deelset, en volledig indien toegestaan), ACC teruggezet en gecontroleerd, oorzaken benoemd. Eis gehaald: per letter A–E op de volledige 352 ≥ 80% gevonden en ≤ 10% vals, met noemers. Beide worden apart gemeld; "afgerond" is geen "gehaald".

## Assumptions

- Synthetische seeds zijn representatief genoeg voor de referentietegels.
- Zonder zuivere D/E-referenties in de poort valt een D/E-melding weg of wordt verkeerd gelabeld (CAP-3 meet).

## Open questions

- Is de vals-eis (≤10%) haalbaar voor B/C/A met alleen prompt + poort? Zo niet: oorzaak benoemen en als open besluit melden.
