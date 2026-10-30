---
title: 'Spike fase B: telscript CAP-3 (tel.py)'
type: 'feature'
created: '2026-10-30'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/meetopzet.md'
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-fase-b-cap3-telscript.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Fase B van de spike heeft per keurmerk en per variant/run een telling nodig van gevonden, gemiste en onterechte meldingen tegen de AI-waarheid, met Wilson- en GLN-bootstrapintervallen, een voorlopige rangorde en een blinde adjudicatielijst; die telling moet uit de bewaarde ruwe uitvoer opnieuw te berekenen zijn, ook na adjudicatie (SPEC CAP-3, CAP-5).

**Approach:** Eén stdlib-script `fase-b/tel.py` met adapters voor de ruwe formaten (B0, K1a/b, K2a/b, K3b, K3c, K4-xy) en de telregels van meetopzet §3, de rangorde van §0/§5 en de adjudicatie van §6; groen tegen de bestaande acceptatietoets `fase-b/test_tel.py` (26 toetsen, rood op 30-10).

</frozen-after-approval>

## Implementation Notes

- Route-poort (step-02), drie feiten: **intentgaten** geen die de gebruiker in de uitkomst merkt (het contract en de briefing beslissen de telregels; resterende detailkeuzes hieronder vastgelegd en als open vraag aan de aanroeper teruggegeven); **onomkeerbaar** niets (lokaal script, geen netwerk, geen database, niet committen); **voetafdruk** één nieuw bestand (`tel.py`), toets bestaat al, niets anders roept het aan. → `oneshot`.
- Specbestand staat in de worktree, niet in de hoofdmap: de briefing verbiedt schrijven buiten `.claude/worktrees/spike-fase-b`.
- Committen: overgeslagen op uitdrukkelijke instructie van de aanroeper ("Commit NIET; stage niets").
- Bouw (30-10, eerste subagent): `fase-b/tel.py` (stdlib) groen tegen `fase-b/test_tel.py`; 28 toetsen. Een eerste Blind Hunter-ronde (11:19) is niet herleidbaar vastgelegd (geen triage op schijf); daarom is de Blind Hunter-laag op 30-10 opnieuw gedraaid (tweede subagent) en volledig getrieerd hieronder.
- Doorgevoerd na review (tweede subagent): winnaarregel (§0 Wilson-overlap op gepoolde gevonden% over de keurmerken in de rangorde, slechtste run; geen winnaar bij ongeldige run of minder dan twee runs), "ja" geldt voor alle groepsleden (lid dat geen toegevoegd vak raakt krijgt een eigen vak), B0-drempels vast volgens §2 (los van `--drempel`), bestaande afwijkende `adjudicatielijst.json` wordt niet overschreven, na adjudicatie apart bestand `resultaat-na-adjudicatie.json`, `adjudicatie.niet_lekgetoetst`, per variant/run aandeel niet-gelabelde meldingen (teller/noemer), per keurmerk beste variant met gat tot 80% in procentpunten (§5.5, CAP-5), stabiliteit met noemer, rangorde met `beoordeeld`, `gepoold` en `runs`. `test_tel.py`: 3 nieuwe toetsen, 4 bijgewerkt; 31 groen. De 6 inhoudelijk gewijzigde/nieuwe toetsen falen op de code van vóór de review (VERIFIED).
- Interpretatiekeuze (open vraag aan de aanroeper): §0 "een verschil kleiner dan de overlappende Wilson-intervallen is geen winnaar" is uitgewerkt als: de gepoolde Wilson-95% (gevonden/positief over de keurmerken in de rangorde, slechtste run) van nummer 1 en 2 overlappen → geen winnaar.
- B0-controle tegen `nulmeting/RESULTAAT.md` (VERIFIED 30-10): `tel.py` telt 26 van 186 gevonden, per keurmerk gelijk aan de tabel; zonder de 56 herpakte etiketten 19 van 113 (RESULTAAT: 19 van 113 ongewijzigde PNG's). Verschil alleen in onterecht: `tel.py` 24 van 58 meldingen (elke samengevoegde melding die geen waarheidsvak raakt, ook op een positief etiket op de verkeerde plek), RESULTAAT 13 top-15-combinaties etiket+code zonder enig AI-vak.

## Review Triage Log

Blind Hunter (30-10-2026, verse subagent, 14 bevindingen):

1. Winnaar zonder Wilson-overlapregel (§0) — `medium`, patch: `_winnaar_deel` met gepoolde Wilson; toets `test_winnaar_vraagt_twee_geldige_runs_en_niet_overlappende_wilson`.
2. Variant met één run kan winnen (§0 "beide runs") — `medium`, patch: `runs` in de rangorde, geen winnaar bij < 2 runs; zelfde toets.
3. Ongeldige run (> 2%) telt mee voor de winnaar (§3.7) — `medium`, patch: geen winnaar als de beste een ongeldige run heeft; `test_tellers_…` bijgewerkt (verwachtte eerder `winnaar == "k1a"`).
4. "Ja" geldt niet voor alle ketenleden (§0) — `medium`, VERIFIED met keten A~B~C (k1b bleef onterecht); patch in `pas_adjudicatie_toe` (sleutel meegeven); toets `test_ja_geldt_voor_alle_leden_van_een_ketengroep`.
5. Herdraaien zonder `--adjudicatie` overschrijft de lijst; oude antwoorden vallen stil op andere items — `medium`, patch: weigeren bij afwijkende bestaande lijst; toets `test_cli_b0_drempel_vast_en_lijst_niet_overschrijven`.
6. Adjudicatierun overschrijft `resultaat.json` van vóór adjudicatie — `low`, patch (één bestandsnaam): `resultaat-na-adjudicatie.json`; `test_cli_end_to_end` bijgewerkt.
7. `tel.py` toetst zijn eigen bevriezing (`bevroren-telscript.json`) niet — `false`: §0 legt de bevriezing als procedure vast (eigen commit vóór de eerste telling; het rapport vergelijkt); `tel.py` schrijft `tel_py_sha256` in de uitvoer, en het bestand bestaat nog niet (wordt ná deze bouw gemaakt door `fb_bevries.py telscript`).
8. B0-drempel hangt aan `--drempel` — `low`, patch: B0 altijd §2-drempels (ook zo in `bevroren.json` → `drempels.b0`); zelfde CLI-toets met `--drempel 0.95`.
9. Beeld-sha256 (§3.10) niet vergeleken in `tel.py` — `false`: de vergelijking gebeurt per aanroep in `fb_common.lees_beeld` (regel 45, gooit bij afwijking) en de sha staat als `bron_sha256` in elk record; B0 legt per etiket de sha van het verstuurde bestand vast (`invoer`).
10. Door adjudicatie toegevoegde paren niet op lekken getoetst — `low`, patch: `adjudicatie.niet_lekgetoetst` (zelfde CLI-toets); de echte lekcontrole is uitgesteld (deferred-work).
11. Kosten met de hand via `--kosten`; ontbrekende variant krijgt stil ∞ — `false`: kosten komen uit `fb_kostentijd.py` (CAP-4, schrijft `kosten.json` voor `--kosten`); een ontbrekende variant staat zichtbaar als `"kosten": null` in de rangorde.
12. Etiketmaat voor K2/K3 alleen uit K1/B0 — `low`, verworpen: alleen bereikbaar als B0 én alle K1-runs voor hetzelfde etiket mislukken (B0 mislukte 1×, e169, zonder AI-vakken), en raakt dan alleen vakken die buiten het etiket steken.
13. Ontbrekende uitvoer — tijd/geheugen/§5.1: `false` voor deze spec (CAP-4, `fb_kostentijd.py`; §5.1-koppeling uitgesteld, deferred-work). Aandeel niet-gelabelde meldingen (§0) en beste variant + gat in procentpunten (§5.5, CAP-5): `medium`, patch (`niet_gelabeld`, `beste_per_keurmerk`); toetsen `test_tellers_…` en `test_winnaar_…`.
14. Toetsgaten — gedekt door de nieuwe toetsen hierboven; `fb_k1.parse` (tegel → etiket) uitgesteld (deferred-work, ander script); bootstrap met noemer 0: `low`, patch (twee asserts in `test_bootstrap_gln_reproduceerbaar`).

