---
id: SPEC-nutriscore-k4aa-letterlezer
companions:
  - ../spec-nutriscore-k4aa-de/SPEC.md
  - ../spec-logo-scan-k4aa/SPEC.md
sources:
  - ../../implementation-artifacts/investigations/nutriscore-k4aa-ronde2-meting-20261124.md
---

> **Canonical contract.** Basis: SPEC-nutriscore-k4aa-de (ronde 2) en SPEC-logo-scan-k4aa. Deze spec wijzigt alleen de letterbepaling van Nutri-Score; route, vensters, poort, ZDR en codelijst blijven.

# Nutri-Score ronde 3: aparte letterlezer op de uitgesneden balk

## Why

Ronde 2 (deelset 119, acc@46e5810): A 85%/0% vals, D 91%/9%, E 91%/0% halen de eis (≥80% gevonden, ≤10% vals); B 100% gevonden maar 62% vals (18/29), C 53% gevonden en 10 van 15 C-etiketten als B gemeld. Offline bewijs kleur-lezer (`scripts/nutriscore_crop_lezer_offline.py`, 24-11-uitsneden, 71 etiketten met één letter, 1 uitsnede per etiket): 21 goed, 2 fout (beide B, gelezen als A en E), 48 geen lezing; dus precies maar niet foutloos, en zijn fouten zitten juist op B. Niets gemeten over wie wint bij verschil met Gemini: daarom beslist Gemini in deze ronde. Let op: die uitsneden komen uit de run op de 352 toetsetiketten (lek benoemd; geen keuze is erop gebaseerd). Oorzaak (INFERENCE): Gemini leest de uitvergrote letter bij B/C fout als hij de hele etiketsectie ziet, en stemmen versterken die fout. SigLIP kan letters niet scheiden (ronde-2-oorzaakrapport). Besluit Friso 25-11: een aparte letterlezer krijgt alleen de uitgesneden balk.

## Capabilities

- **CAP-1** — Eén letterbepaling per balk
  - **intent:** Na de familiepoort wordt elke gevonden Nutri-Score-balk één keer apart gelezen; die uitslag bepaalt de letter.
  - **success:** Toetsen met vaste meldingen en een nagebootste aanroep. Balk = ketengroep (union-find zoals `merge`, IoU ≥ 0,5, welke letter ook); een toets met een balk die op een venstergrens is afgekapt (IoU < 0,5 met het hele-etiketvak) bewijst het gedrag. Uitsnede = vak van het lid met de laagste `orde` + 15% marge, begrensd op het beeld, via `encode_window` (langste zijde ≤ 1500); een uitsnede < 16 px aan een zijde krijgt geen aanroep (balk volgt `one_letter`). Eén aanroep per balk. Antwoord `A`–`E` zet de code van de balk (vak van laagste `orde`, `confidence` = hoogste van de groep); `ander` laat de balk vervallen. Daarna draaien `one_letter` en `merge` opnieuw over alle balken. Eigen antwoordcontrole (enum A–E of `ander`; `_logos()` hoort hier niet bij) en eigen aanroep met dezelfde model/ZDR/temperatuur/`_CALLS` als `_call`; prompt: geen referentieblad, alleen "welke letter van de Nutri-Score-balk is uitvergroot (A–E), of ander"; schema = enum A–E + ander.
- **CAP-2** — Kleur-lezer als tweede mening (alleen vastleggen)
  - **intent:** De bestaande lezer (`nutriscore_reader.read_nutriscore`, crop-modus, `min_ratio=1.18` expliciet, niet via omgevingsvariabele) leest dezelfde uitsnede; zijn uitkomst verandert in deze ronde niets aan de letter.
  - **success:** Toetsen: lezer gelijk aan Gemini → `letter_reader_agree`+1; verschil → `letter_reader_disagree`+1; geen lezing → `letter_reader_none`+1; de gemelde letter is in alle drie gelijk aan de Gemini-letter. Een constante `READER_OVERRIDES = False` is vastgepind; zetten op True (alleen bij een tweede iteratie, op grond van aggregaten) laat de lezer bij verschil winnen.
- **CAP-3** — Terugval, budget en kosten
  - **intent:** Een mislukte of te late letteraanroep maakt het resultaat niet slechter dan ronde 2 en laat de scan niet falen.
  - **success:** Toetsen: fout/time-out/ongeldig antwoord/te weinig budget voor één balk → voor die balk geldt `one_letter` op de leden van die balk; een falende balk annuleert geen andere (geen taakgroep met annuleren bij eerste fout). Eigen venster: pins `LETTER_MIN_S`, `LETTER_MAX_S`, één poging per balk, einde uiterlijk `_left(remaining) - 1 s`; de letteraanroepen mogen niet in `RESERVE_S` (SigLIP-stap) lopen: ze starten ná de poort en gebruiken de overgebleven tijd, de rest valt terug. Deadline- en verbindingssignalen van de runtime (`_PASS`) gaan ongewijzigd door. `MAX_LETTER_BARS = 8` (gepind): bij meer balken krijgen de eerste 8 op laagste `orde` een aanroep, de rest volgt `one_letter`. Tellers `letter_calls`, `letter_changed` (Gemini-letter ≠ stemmen-letter), `letter_ander`, `letter_failed`, `letter_budget_fallback` en de kosten gaan in `stats` en in de infolog-regel (alleen aantallen); tokens/kosten tellen mee in `cost_usd`/`tokens_*`.
- **CAP-4** — Pins en spike-gelijkheid
  - **intent:** Wat ongewijzigd moet blijven, is vastgepind; de nieuwe waarden ook.
  - **success:** `tests/test_k4aa_atdd.py` (bestaande pins) en `tests/test_k4aa_letterlezer_atdd.py` (nieuwe pins): bestaande pins (INSTRUCTIE, DEEL, SCHEMA, referentieblad, model, vensters, TOP15) ongewijzigd groen; nieuwe pins voor letter-prompt, letter-schema, marge 0,15, `MAX_LETTER_BARS`, `LETTER_MIN_S`/`LETTER_MAX_S`, lezer-`min_ratio` 1,18 en `READER_OVERRIDES`, elk met commentaar "SPEC-nutriscore-k4aa-letterlezer".
- **CAP-5** — Meting op ACC
  - **intent:** Het effect wordt gemeten zonder dat de keuzes op de toetsset worden afgestemd.
  - **success:** (a) Deelset 119 (`nutriscore-k4aa-de-20261124/truth-deelset.json`), verse `--out`, alle antwoorden modelVersion `…/k4aa`; rapport per letter gevonden/vals met noemer plus verwarringsmatrix, scantijd per etiket, en uit de ACC-log de tellers van CAP-3 (of expliciet "niet gelezen"). Ruwe antwoorden naar `~/logo-meetset-20261018/nutriscore-k4aa-letterlezer-<datum>/`. (b) Volledige 352 alleen als A, B en C elk ≥ 70% gevonden en ≤ 10% vals halen (n ≥ 10) én A/D/E niet slechter zijn dan ronde 2 (A 85/0, D 91/9, E 91/0 gevonden/vals); het 352-rapport toont de 233 etiketten buiten de deelset apart en de eis wordt daarop beoordeeld. (c) Max één bijsturing, op aggregaten (verwarringsmatrix, tellers), niet op individuele etiketten. Kosten (AANNAME: ≈ $0,012 per etiket ronde 2 uit de spike + ≈ $0,004 per balk): deelset ≈ $2,5; deelset opnieuw na bijsturing ≈ $2,5; volledig ≈ $7. Plafond $10 totaal: dreigt de som erboven, dan eerst vragen aan Sanne.
- **CAP-6** — ACC terugzetten
  - **intent:** ACC is na afloop weer in de uitgangstoestand.
  - **success:** `LOGO_SCAN_ROUTE` (gewoon en preview) en `LOGO_PIPELINE_KEYS_EXTRA` weg, redeploy klaar, `/health` 200, testsleutel 401, Coolify teruggelezen; testscan geeft modelVersion zonder `/k4aa`, of UNVERIFIED met het commando. Sanne zet en haalt sleutel en schakelaars weg; n8n-credential/flow en Keychain-item blijven. Alleen ACC.

## Constraints

- Geen providersleutel lokaal; alle provideraanroepen op ACC. Geheimen nooit in gesprek, log of repo.
- Geen database-schrijfacties op ACC; B/C-referenties niet opschonen (niet goedgekeurd).
- Voorbeeld-/referentiebeelden blijven gescheiden van de 352 toetsetiketten; er worden geen toetsbeelden als voorbeeld in de prompt gebruikt.
- Kleur-lezer wijzigt alleen een letter, voegt nooit een balk toe en wijzigt de lezer zelf niet.
- NUTRISCORE_* blijft buiten `BRUIKBAAR` (uncertain, requires_review).
- Logs: alleen aantallen en foutklassen, nooit beeld, prompt of antwoord.
- Lokaal typecheck/gerichte tests groen vóór push; push/PR naar `acc` volgens ACC-vrijgave; nooit productie.

## Non-goals

Andere keurmerken; wijziging van vensters, familiepoort of codelijst; getraind model; herschalen van etiketten; opname in `BRUIKBAAR`; productie-uitrol.

## Success signal

Gebouwd, getest, gemeten (deelset; volledig indien toegestaan), ACC teruggezet en bewezen. Eis gehaald = per letter A–E op de 352 ≥ 80% gevonden en ≤ 10% vals met noemers; anders een onderbouwde conclusie met opties. "Afgerond" is geen "gehaald".

## Assumptions

- Gemini leest een losse, schone balkuitsnede betrouwbaarder dan een hele sectie (INFERENCE; offline zichtbaar: uitsneden zijn schoon, ook zwart-wit-varianten).
- Eén extra aanroep per balk past binnen het scanbudget (AANNAME; de deelmeting meldt scantijd en het aantal terugvallen op budget).

## Open questions

- Welk deel van de B/C-fouten is een verkeerd uitgesneden of D/E-balk die als A–C wordt gemeld? Wordt in de deelmeting uit de verwarringsmatrix afgeleid.
