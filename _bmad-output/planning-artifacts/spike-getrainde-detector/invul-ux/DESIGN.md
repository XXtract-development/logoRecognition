---
name: Invulpagina toetsset (proef getrainde detector)
description: Lokale beoordelingspagina waarop Friso per etiket bevestigt welke van de 9 keurmerken erop staan; alles op één scherm.
status: final
updated: 2026-11-02
sources:
  - ../SPEC.md
  - ../toetsset.md
colors:
  navy: '#2F5A7A'
  navy-vulling: 'rgba(47, 90, 122, 0.18)'  # {colors.navy} op 18%
  teal: '#54949E'
  teal-licht: '#EAF4F5'
  groen: '#B7D945'
  rood: '#D64545'
  tekst: '#1E293B'
  tekst-gedempt: '#5B6B7B'
  lijn: '#D5DEE6'
  vlak: '#F4F7F9'
  wit: '#FFFFFF'
typography:
  basis:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.4'
  klein:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 12px
    lineHeight: '1.3'
  kop:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 15px
    fontWeight: '600'
  code:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: 13px
    fontWeight: '600'
rounded:
  sm: 4px
  md: 6px
  lg: 8px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  kopregel: 44px
  rij: 40px
  paneel: 460px
  naamkolom: 190px
  uitsnedekolom: 240px
components:
  kopregel:
    background: '{colors.navy}'
    foreground: '{colors.wit}'
    height: '{spacing.kopregel}'
  segmentknop:
    background: '{colors.wit}'
    foreground: '{colors.tekst}'
    border: '{colors.lijn}'
    radius: '{rounded.sm}'
  segmentknop-gekozen:
    background: '{colors.navy}'
    foreground: '{colors.wit}'
  ai-merkje:
    background: '{colors.teal}'
    foreground: '{colors.wit}'
    radius: '{rounded.sm}'
  keurmerkrij-ai-aanwezig:
    accent: '{colors.teal}'
    background: '{colors.teal-licht}'
  keurmerkrij-actief:
    outline: '{colors.navy}'
  tegelkader:
    border: '{colors.teal}'
  tegelkader-actief:
    border: '{colors.navy}'
    background: '{colors.navy-vulling}'
  knop-hoofd:
    background: '{colors.navy}'
    foreground: '{colors.wit}'
    radius: '{rounded.md}'
  knop:
    background: '{colors.wit}'
    foreground: '{colors.navy}'
    border: '{colors.navy}'
    radius: '{rounded.md}'
  stand-gehaald:
    accent: '{colors.groen}'
  melding-fout:
    foreground: '{colors.rood}'
---

# Invulpagina toetsset — vormgeving

Gedrag staat in [EXPERIENCE.md](EXPERIENCE.md). Bij strijd met een schermafbeelding of de oude pagina winnen deze twee documenten.

## Brand & Style

Een werkinstrument voor één beoordelaar die 352 etiketten achter elkaar nakijkt op 9 keurmerken (8 met aanwezig/afwezig/onzeker plus Nutri-Score). Rustig en zakelijk in de XXtract-huisstijl: navy voor wat de beoordelaar kiest en bedient, teal voor alles wat van de AI komt (de AI-voorinvulling), groen alleen als een doel gehaald is, rood alleen voor een fout. Het etiket zelf is het belangrijkste beeld op het scherm; de bediening eromheen is compact en strak.

## Colors

- **Navy `{colors.navy}`** — kopregel, gekozen segmentknop, hoofdknop, actieve rij, actief tegelkader. Betekent "dit heb jij gekozen of dit bedien je nu".
- **Teal `{colors.teal}`** — alles wat van de AI komt: het AI-merkje op een knop, de markering van rijen waar de AI een keurmerk zag, de kaders op het etiket en de rand van de uitsneden. `{colors.teal-licht}` is de achtergrond van zo'n rij.
- **Groen `{colors.groen}`** — alleen het bolletje bij een keurmerk waarvan het doel gehaald is: ≥ 16 bevestigde etiketten mét en ≥ 50 zónder dit keurmerk.
- **Rood `{colors.rood}`** — alleen voor een foutmelding (opslaan mislukt, nog niet alles gekozen, geen voorinvulling). Nooit decoratief.
- **Tekst `{colors.tekst}`**, gedempte tekst `{colors.tekst-gedempt}` voor standen en uitleg, lijnen `{colors.lijn}`, paginavlak `{colors.vlak}`.

Contrast: `{colors.wit}` op `{colors.navy}` en `{colors.tekst}` op `{colors.wit}` halen WCAG AA voor gewone tekst; Teal is nooit tekstkleur: alleen achtergrond van het witte AI-merkje (vet, klein) of rand.

## Typography

Eén lettertype: Inter als het op de machine staat, anders het systeemlettertype (geen download). `{typography.basis}` voor alles, `{typography.klein}` voor standen, AI-merkjes en de sneltoetsen, `{typography.kop}` voor de paginatitel, `{typography.code}` voor de etiketcode.

## Layout & Spacing

- De pagina vult precies het venster (100vh) en scrollt nooit. Kopregel `{spacing.kopregel}` hoog.
- Daaronder drie kolommen: **etiketbeeld** (alle overige breedte) · **AI-uitsneden** (`{spacing.uitsnedekolom}`, vervalt als het etiket geen uitsneden heeft) · **beoordelingspaneel** (`{spacing.paneel}`). Tussenruimte `{spacing.3}`, buitenmarge `{spacing.3}`.
- In een venster van 1440 breed krijgt het etiketbeeld zo ±690 px breedte, in 1920 ±1170 px.
- Keurmerkrijen zijn `{spacing.rij}` hoog (naam en stand op twee regels): 9 rijen plus melding, opmerking, knoppen en sneltoetsenregel passen in een venster van 800 px hoog. Niets in een rij mag afbreken naar een extra regel: de naam wordt zo nodig afgekapt met een beletselteken (volledige tekst in `title`); de stand staat altijd volledig.
- Alleen het beeldvak en (bij veel uitsneden) de uitsnedekolom scrollen intern.

## Elevation & Depth

Geen schaduwen. Vlakken onderscheiden zich door `{colors.wit}` op `{colors.vlak}` en een lijn van 1 px `{colors.lijn}`.

## Shapes

`{rounded.sm}` voor segmentknoppen en merkjes, `{rounded.md}` voor knoppen, `{rounded.lg}` voor de drie kolomvlakken.

## Components

- **Kopregel** — `{components.kopregel}`. Eén regel, nooit afbreken: titel, voortgang ("9 van 352 etiketten afgehandeld"), positie ("10 / 352"), statusmerkje van het etiket (bevestigd / onleesbaar), etiketcode in `{typography.code}`. Bij te weinig ruimte wordt eerst de titel en daarna de etiketcode afgekapt met een beletselteken. De sneltoetsen staan onderaan het paneel in `{typography.klein}`.
- **Etiketbeeld** — wit vlak; beginstand en zoom zoals EXPERIENCE.md (Etiketbeeld) beschrijft; over het beeld `{components.tegelkader}`-kaders (2 px) op de plek van elke AI-uitsnede, alle kaders van de actieve rij in `{components.tegelkader-actief}`: 3 px navy rand en lichte navy vulling, bovenop de andere kaders, zodat ze ook op een smalle strook opvallen; inactieve kaders hebben geen vulling. Beginstand passend (hele etiket, 100% breedte of hoogte van het vak, in beide richtingen gecentreerd, geen scrollbalk): cursor `zoom-in`; ingezoomd: cursor `zoom-out`. Kan het beeld niet laden: gedempte tekst in het midden van het vak.
- **Uitsnede** — vierkant beeld (max. kolombreedte) met 2 px teal rand en eronder de keurmerknaam in `{typography.klein}`; uitsneden van de actieve rij krijgen een navy rand.
- **Keurmerkrij** — links een kolom van `{spacing.naamkolom}` met op de eerste regel de naam (vet) en zo nodig "gewijzigd" of "AI: —" / "AI: geen letter", daaronder in `{typography.klein}` `{colors.tekst-gedempt}` alleen de stand ("mét 3/16 · zonder 12/50", groen bolletje als gehaald); rechts de segmentknop. AI zag het keurmerk → linkerrand 3 px teal en achtergrond `{colors.teal-licht}`. Actieve rij → outline 2 px navy. Gewijzigd t.o.v. AI → woordje "gewijzigd" in navy, `{typography.klein}`, naast de naam.
- **Segmentknop** — drie aaneengesloten knoppen Aanwezig / Afwezig / Onzeker (`{components.segmentknop}`); gekozen = `{components.segmentknop-gekozen}`. De knop met de AI-voorinvulling draagt rechtsboven een `{components.ai-merkje}` "AI". De echte radio-input ligt onzichtbaar over de knop (zelfde afmeting). Zichtbare focusring bij toetsenbordbediening.
- **Nutri-Score-rij** — zelfde rij, met vijf letterknoppen A–E en een knop "letter onleesbaar" (aan/uit, zelfde gekozen-stijl); AI-letters dragen het AI-merkje. Staat "letter onleesbaar" aan, dan zijn de letters gedempt (ze tellen dan niet).
- **Opmerkingveld** — 2 regels hoog, rand `{colors.lijn}`.
- **Knoppen** — `{components.knop-hoofd}` "Bevestigen en volgende", `{components.knop}` "Bevestigen" en "Etiket onleesbaar", op één regel.
- **Melding** — onder de knoppen; gewone tekst, fout in `{components.melding-fout}` vet.

## Do's and Don'ts

| Doen | Niet doen |
|---|---|
| Teal alleen voor wat van de AI komt | Teal gebruiken voor een keuze van Friso |
| Het etiket de grootste vlakte geven | Het etiket in een smalle strook of onder de vouw zetten |
| Alles zonder paginascroll in een venster van 1440×800 (scherm 1440×900) | Een tweede regel kopruimte of een losse standenbalk |
| Rood alleen bij een fout | Rood voor "afwezig" of als accent |
| Systeemlettertype als terugval | Lettertypen of bibliotheken van internet laden |
