---
id: SPEC-spike-architectuurkeuze-logoherkenning
title: "Spike: welke opzet voor logoherkenning haalt 80% gevonden en <10% vals per keurmerk?"
type: spike (vergelijkende meting, geen productiecode)
datum: 2026-10-18
bijgewerkt: 2026-10-30 (fase B op de voorlopige ontwikkelset van 173 etiketten)
peildatum_code: origin/acc b6a0857
status: fase B gedraaid op 173 door AI bevestigde etiketten (30-10); uitkomst voorlopig tot adjudicatie (BESLISRAPPORT.md); CAP-1 (243 door Friso bevestigd) open
invulpagina: https://claude.ai/artifact/KJvPSJk5WKq8Vcsj8bUS73
companions:
  - ONDERZOEK.md
  - meetopzet.md
  - meetset.md
  - ../eindtest-logo-pijplijn/WAARHEID.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Spike: architectuurkeuze logoherkenning

## Why

Pijn, met een eis van de productowner. Een top-15-keurmerk mag pas "automatisch" als het op volledige etiketten in ≥80% gevonden wordt met <10% valse meldingen. De huidige opzet (één taalmodelaanroep wijst vakjes aan op een tot 2400 px verkleind etiket; EfficientNet-B0 zoekt de dichtstbijzijnde van 540 referenties) haalt 34 van 256 gedeclareerde keurmerken (13%, ACC 13-10-2026, 186 etiketten) en 26 van 186 AI-gelabelde top-15-paren op de juiste plek (nulmeting 30-10 op de ontwikkelset). Van 90 gemiste top-15-logo's kregen er 56 geen vakje, 20 een verkeerde soort en stonden er 11 niet op het etiket (AI-oordeel). Friso koos: eerst de opzet kiezen op bewijs, door de kandidaat-opzetten op dezelfde meetset te meten. Bronnen: [onderzoek 12-10](../../implementation-artifacts/investigations/acc-top15-logoherkenning-slecht-20261012.md), [spike stap 2](../spike-stap2-getraind-model/RAPPORT.md), meetverslag stap 1 (`origin/acc:_bmad-output/specs/spec-stap1-localization-recall/meetverslag.md`), [ONDERZOEK.md](ONDERZOEK.md), nulmeting `~/logo-meetset-20261018/ontwikkelmeting-20261028/nulmeting/RESULTAAT.md`.

## Capabilities

- **CAP-1** — meetset bevriezen
  - **intent:** er ligt een waarheid per etiket (welke top-15-keurmerken zichtbaar zijn en waar) die niet uit een declaratie of uit een geteste variant komt.
  - **success:** eindopzet: alle 243 etiketten door Friso op "klaar" op de [invulpagina](https://claude.ai/artifact/KJvPSJk5WKq8Vcsj8bUS73) (open). Fase B (30-10, keuze Friso): de 173 etiketten van `voorlopige-selectie.json` met door AI bevestigde vakken, sha256 van dat bestand en van elk beeld vastgelegd in `fase-b/bevroren.json`; per keurmerk positieve paren, kern/aanvulling en lekparen geteld ([meetopzet.md §1](meetopzet.md)).
- **CAP-2** — elke variant draait op dezelfde bytes
  - **intent:** elke variant uit [meetopzet.md §2](meetopzet.md) verwerkt exact dezelfde etiketbeelden en bewaart de ruwe uitvoer per etiket en run.
  - **success:** per variant en run voor elk van de 173 etiketten óf uitvoer óf een vastgelegde fout, met de sha256 van het bronbeeld; hoogstens 2% fouten, anders is de run ongeldig. B0 (hergebruikte nulmeting) is gemarkeerd voor 56 herpakte beelden.
- **CAP-3** — telling per keurmerk
  - **intent:** per keurmerk en variant tellen hoeveel aanwezige keurmerken op de juiste plek gevonden zijn, hoeveel gemist, en hoeveel meldingen niet bij een waarheidsvak horen.
  - **success:** tabellen voor alle 15 keurmerken × alle varianten met teller/noemer, Wilson-95%- en GLN-bootstrapinterval; voor alle paren, zonder lekparen, alleen aanvulling en alleen kern; opnieuw te berekenen met één getoetst script uit de bewaarde uitvoer en de waarheid, ook na adjudicatie.
- **CAP-4** — kosten en tijd
  - **intent:** per variant de kosten per etiket (modeltokens × tarief, of CPU-seconden) en de tijd per etiket meten.
  - **success:** voor elke variant gemeten waarden (mediaan, p90, max tijd; gemiddelde en totale kosten), niet geschat.
- **CAP-5** — beslisrapport
  - **intent:** vaststellen welke opzet per keurmerk het dichtst bij 80%/10% komt, en tegen welke kosten.
  - **success:** voorlopige rangorde volgens [meetopzet.md §0 Rangorde vóór adjudicatie](meetopzet.md) (B0 als referentielijn erbuiten) met per keurmerk "vindt het / vindt het, onzeker / vindt het niet / te weinig voorbeelden" en vals% als bovengrens, een aanbeveling of "geen variant vindt het" met het gat in procentpunten, plus een blinde adjudicatielijst als lokaal bestand: alle niet-gelabelde meldingen van alle varianten én de gemiste paren van de beste variant per keurmerk ([meetopzet.md §0, §6](meetopzet.md)). Na de adjudicatie geldt §5.

## Constraints

- Geen drempel, prompt, samenvoegregel, variantkeuze of referentieset afstellen op de meetset. De K1-instructie wordt op 10 trainingsproducten buiten de meetset uitgeprobeerd; alles wordt vóór de eerste aanroep op de meetset bevroren met hash in `fase-b/bevroren.json` ([meetopzet.md](meetopzet.md), kopnotitie).
- De meetset bevat geen product dat geleerd of afgesteld is: GTIN's uit `training_data`, `reference_logos`, `reference_candidates`, `gold_set_records`, `hard_negatives` en `declared_harvest_checks` (ACC 18-10-2026) zijn uitgesloten. Bijna-gelijk ontwerp op een ander GTIN wordt na het bevriezen als lekpaar gemarkeerd en apart gerapporteerd.
- Een declaratie is geen bewijs dat een logo zichtbaar is. De waarheid van fase B is een AI-oordeel; ontbrekende codes zijn geen betrouwbaar negatief. Meldingen zonder waarheidsvak tellen voorlopig als onterecht en gaan blind naar Friso (adjudicatie, [meetopzet.md §6](meetopzet.md)); tot die uitslag is elke uitkomst voorlopig.
- Geen zware proeven in de live ml-service-container op ACC (12-10: 2 van 4 werkers uitgevallen bij 8 GB). Beeldnetwerken lokaal op CPU; taalmodelaanroepen via OpenRouter met een klein script, sleutel alleen in het geheugen, alles daarna opruimen.
- Klantbeelden alleen lokaal of in het privé-artefact; nooit in de repository.
- Alleen lezen op ACC-databases en productie; MongoDB alleen op `_id`.
- OpenRouter-uitgaven per post stoppen bij 1,5× de schatting in [meetopzet.md §7](meetopzet.md).

## Non-goals

- Productiecode, uitrol of een wijziging op ACC.
- K3a (eigen gesloten detector): niet gemeten, want er zijn geen vakjes op hele etiketten om op te trainen en twee eerdere pogingen faalden op data. Terug op tafel zodra bevestigde vakjes uit deze meetset (of K1-runs) als trainingsmateriaal bestaan.
- Keurmerken buiten de top 15 meten (ook niet de lange staart van K4); ze tellen alleen mee als bron van niet-gelabelde top-15-meldingen.
- Een keurmerk op "automatisch" zetten: deze spike rangschikt opzetten; automatisch vraagt een aparte validatie op nieuwe, door een mens bevestigde etiketten.
- Foto's van gebogen of glanzende verpakkingen; de meetset is artwork zoals de pijplijn die krijgt.
- De 70 nog niet beoordeelde etiketten van de 243: ze blijven buiten fase B en worden niet gebruikt voor het uitproberen van instructies.

## Success signal

- Er ligt één tabel "15 keurmerken × varianten" met gevonden% en vals% (teller/noemer, intervallen), kosten en tijd per etiket, gemarkeerd als voorlopig, waaruit Friso kan aflezen welke opzet het verdient om gebouwd en daarna op door hem bevestigde etiketten gevalideerd te worden, of dat geen opzet de eis haalt en hoe groot het gat is.

## Assumptions

- AANNAME (niet gemeten): de Claude-voorstellen plus de Codex-beoordeling dekken de meeste zichtbare top-15-logo's; Codex voegde geen gemiste logo's toe, en de derde AI-ronde zag een verkleinde samengestelde weergave en controleerde niet aantoonbaar alle tegels, dus gemiste logo's komen pas via de adjudicatie boven.
- Waarheidsvakken zijn benaderend (AI-vakken, niet strak getekend); de telregel in [meetopzet.md §3](meetopzet.md) is daarop afgestemd.
- 24 etiketten boven 80 MP en 10 zonder (volledige) lagen vielen bij de 243 af; van de 243 zijn er 173 beoordeeld. Dat is een lichte vertekening naar kleinere en eenvoudiger etiketten (INFERENCE: niet gemeten welke 70 overbleven).
- Bronhash-controle tegen trainingsbeelden gaf 0 treffers, maar het hashschema van `provenance.sourceFile` is niet bevestigd; de GTIN-uitsluiting plus de lekcontrole na bevriezen zijn de werkende controles.
- 92 van de 173 etiketten (kern) komen uit de steekproef waarop de huidige route en de tegelvariant zijn gemeten en gerepareerd; daarom ook tabellen voor alleen de 81 aanvullingsetiketten en alleen de kern.
- De meetset is verrijkt (schaarse keurmerken en alcohol zijn er bewust bij gezocht); vals% als aandeel van de meldingen is daardoor gunstiger dan in productie. Vals-alarm per etiket wordt daarom altijd ernaast gerapporteerd.
- 49 bron-GLN's in de set; een GLN is geen bewezen merk of familie. Het bootstrap-interval op GLN is dus een benadering.
- K2/K3-drempel 0,80 is niet gekalibreerd; op trainingsuitsneden buiten de meetset is hij niet ontaard (SigLIP 2: 669 juist en 142 onjuist ≥0,80 van 852).

## Open Questions

Friso koos op 30-10 niets anders dan de standaardantwoorden. Afwijkingen: vraag 6 is niet uitgevoerd (geen gekeurde negatieven) en vraag 4 is herschaald naar 173 etiketten.

1. **Wat beslist de spike?** Standaard (geldt): de spike rangschikt opzetten; een keurmerk gaat pas op "automatisch" na een aparte validatie op nieuwe etiketten.
2. **Welke maat is "<10% vals"?** Standaard (geldt): aandeel onterechte meldingen (vals%); vals-alarm per etiket staat ernaast.
3. **Mag klantartwork naar Google (K1a, via OpenRouter)?** Standaard (geldt): ja, onder dezelfde voorwaarden als de GHS-beoordeling op ACC; voorwaarden van OpenRouter/Google voor bewaren en trainen in het rapport.
4. **Budget fase B** ±$68–81 voor 243 etiketten, herschaald naar 173: ±$44–53, stopgrens 1,5× per post ([meetopzet.md §7](meetopzet.md)). Standaard (geldt): akkoord.
5. **DINOv3 (eigen licentie):** standaard (geldt): meten (intern, geen inzet); licentie pas toetsen als K2b wint.
6. **Negatieven voor K2/K3-kalibratie door Friso gekeurd:** niet gebeurd → K2/K3 draaien "niet gekalibreerd" op 0,80; K3b zonder onbekend-klasse.
7. **Zwangerschapswaarschuwing:** standaard (geldt): positieven uit alcoholproducten volstaan (10 in de ontwikkelset).
8. **K3c meten?** Standaard (geldt): ja.
9. **K1b: Claude houden?** Standaard (geldt): ja.
10. **Nieuw:** wanneer bevestigt Friso de waarheid (CAP-1) zodat de eindmeting op 243 kan draaien? Tot dan is elke rangorde uit fase B voorlopig.
