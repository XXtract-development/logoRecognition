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

> Ronde 2 (24 november 2026): CAP-2 vervangen (familiepoort), CAP-3 vervallen, CAP-5 aangepast. Bronnen ronde 2: `../../implementation-artifacts/investigations/nutriscore-k4aa-ronde2-oorzaak-20261124.md`.

## Why

Meting 24-11 op 352 etiketten (ACC, acc@869dfa1): A 92% gevonden / 21% vals, B 45%/44%, C 79%/26%, D 0/32, E 0/21. D en E zijn per ontwerp onmogelijk (codelijst kent alleen A/B/C; C-omschrijving zegt "D or E: ander"). Besluit Friso 24-11 (item 62): uitbreiden met D en E. Eis per letter: ≥80% gevonden en ≤10% vals.

## Capabilities

- **CAP-1**
  - **intent:** K4-aa kan NUTRISCORE_D en NUTRISCORE_E melden naast A/B/C.
  - **success:** Toetsen: `TOP15` bevat 17 codes met beide nieuwe; prompt-omschrijving en schema-enum bevatten ze (schema leidt uit de lijst af); de C-omschrijving bevat geen "D or E: ander" meer; de instructie krijgt één regel: "For Nutri-Score, use the code of the one enlarged letter and box the whole bar; a bar without an enlarged letter is \"ander\""; elke omschrijving van A–E noemt dat precies die letter uitvergroot is; `parse` laat D/E door. Referentieblad bevat tegels NUTRISCORE_D en NUTRISCORE_E uit de synthetische seeds (`reference-logos/NUTRISCORE_D|E`), zelfde stijl als A/B/C, 15 tegels in 4 rijen, 1440×1176 (tegels na NUTRISCORE_C schuiven één plek op, alfabetisch). Herbouwbaar: bouwer = `referentieblad()` in de spike-map (`fase-b/fb_k1.py`, Arial op macOS); het bouwscript komt in de repo naast het blad.
- **CAP-2** (ronde 2, vervangt de letterregel)
  - **intent:** De poort controleert of een uitsnede een Nutri-Score is; de letter komt van Gemini, niet van SigLIP.
  - **success:** Toetsen met vaste embeddings: een melding NUTRISCORE_X blijft als een `NUTRISCORE_*`-code in de top-3 verschillende soorten van het uitsnede staat (ook als X zelf achter een andere letter staat); `confidence` = hoogste Nutri-Score-score in die top; Nutri-Score op plek 4+ valt weg; niet-Nutri-Score-codes ongewijzigd. Bewijs: investigations/nutriscore-k4aa-ronde2-oorzaak-20261124.md (SigLIP-letters liggen binnen 0,03 en ranken scheef (D hoogst in 30/58 vakken, juiste letter op plek 1 in 8/50): geen bruikbaar onderscheid. Letterregel hield 8/50 juiste meldingen vast, de oude top-3-regel 49/50, de familieregel 50/50 — en ook 8/8 foute letters: letterfouten blijven Gemini-kant. Verwacht na de fix op de 24-11-cijfers: A ≈14%, B ≈22%, C ≈40% vals, deels D/E-balken die nu hun eigen code krijgen.) `confidence` zegt niets over de letter. Voor `NUTRISCORE_*` geldt dus niet langer de K4-xy-regel van SPEC-logo-scan-k4aa CAP-3 (eigen code in de top-3). Stemmen in CAP-2b tellen meldingen, niet vensters; bij gelijkstand wint de laagste `orde` (venster 0 = heel etiket): de deelmeting telt hoe vaak dat beslist en hoe vaak er twee letters op een etiket blijven.

- **CAP-2b**
  - **intent:** Eén balk geeft één letter.
  - **success:** Na de poort worden Nutri-Score-meldingen met IoU ≥ 0,5 maar verschillende letter teruggebracht tot één: die met de meeste overlappende meldingen van dezelfde letter (stemmen van de vensters, IoU ≥ 0,5), bij gelijkstand de laagste `orde` (toets met vaste meldingen); de familiescore speelt geen rol. Meldingen van dezelfde letter blijven via `merge`.
- **CAP-2c**
  - **intent:** Statistiek toont wat de letterstap wegneemt.
  - **success:** `stats.letter_dropped` = aantal meldingen dat `one_letter` weghaalt (toets); `na_poort` blijft het aantal na poort, letterstap en samenvoegen.
- **CAP-3** (vervallen in ronde 2)
  - **intent:** (vervallen) Letter-referenties tellen niet meer mee in de poort; opschonen van D/E-referenties op ACC is niet nodig.
  - **success:** Geen ACC-schrijfactie. Blokkade blijft: ontbreken > 8 embeddings dan faalt de scan (`siglip_references_incomplete`). Niets op productie.

- **CAP-4**
  - **intent:** De bewuste afwijking van de spike-pins is vastgelegd en getoetst.
  - **success:** `tests/test_k4aa_atdd.py`: pins voor `INSTRUCTIE`+`DEEL`, `SCHEMA` en `referentieblad` hebben de nieuwe sha256-waarden met een commentaarregel "bewust gewijzigd, SPEC-nutriscore-k4aa-de"; `len(TOP15) == 17`; `scripts/k4aa_vergelijk.py` volgt `TOP15`; alle overige pins (model, temperatuur, vensters, JPEG-regels, ZDR) ongewijzigd en groen. De spike-gelijkheid uit SPEC-logo-scan-k4aa CAP-2 vervalt alleen voor deze drie pins; CAP-8 (spike-vergelijking) vervalt voor deze wijziging.
- **CAP-5**
  - **intent:** Het resultaat wordt gemeten in twee stappen op ACC, zonder lek van de toetsset.
  - **success:** (a) Zelfde deelset als ronde 1 (119: seed 20261124, A/B/C 15, alle D/E, 20 zonder Nutri-Score), verse lege `--out`-map, alle antwoorden modelVersion `…/k4aa`; rapport per letter gevonden/vals met noemer, origineel en herschaald apart. (b) Volledige 352 alleen als elke letter met n ≥ 10 antwoorden ≥ 70% gevonden en ≤ 15% vals haalt voor A, B en C, en D en E niet slechter zijn dan ronde 1 (D 84%/7%, E 14%/0% gevonden/vals); een letter met n < 10 antwoorden is te klein om te beoordelen; anders stoppen met onderbouwde conclusie en opties (max twee iteraties in ronde 2). (c) Prompt, codelijst en referentieblad zijn niet bijgesteld op basis van individuele toetsetetiketten. De poortregel is bepaald met de 24-11-meting op dezelfde etiketten (diagnoserapport; grens van het bewijs: alleen vakken die de oude poort al doorliet, niets over meldingen buiten Nutri-Score-balken). GTIN-overlap tussen actuele referenties en de 352 wordt gemeten (12-07: 0 van 29). `stats` staan niet in het API-antwoord: of E bij Gemini of bij de poort sneuvelt wordt indirect afgeleid (de familiepoort weigert vrijwel geen Nutri-Score-uitsnede).

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
- Elke `NUTRISCORE_*`-referentie stemt mee als familie; of er onzuivere (Beter Leven/Halal) bij zitten is niet gemeten (UNVERIFIED; read-only telling op ACC mogelijk, geen schrijfactie).

## Open questions

- Is de vals-eis (≤10%) haalbaar voor B/C/A met alleen prompt + poort? Zo niet: oorzaak benoemen en als open besluit melden.
