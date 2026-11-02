---
name: Invulpagina toetsset (proef getrainde detector)
status: final
updated: 2026-11-02 (ronde 9: 13 rijen, nalopen)
sources:
  - ../SPEC.md
  - ../toetsset.md
---

# Invulpagina toetsset — gedrag

Vormgeving en tokens staan in [DESIGN.md](DESIGN.md). Eisen en antwoordmodel komen uit [toetsset.md §6](../toetsset.md#6-invulpagina-voor-friso-cap-3) (CAP-3); dit document verandert die niet; het beschrijft alleen bediening en indeling.

## Foundation

Eén lokale webpagina (`invul/index.html`) geserveerd door `invul/server.py` op 127.0.0.1, voor desktop en laptop (schermen 1440×900 en 1920×1080), muis en toetsenbord. Eén gebruiker: Friso. Geen externe bibliotheken, lettertypen of CDN's: de pagina werkt offline.

**AI-voorinvulling** = het oordeel van het taalmodel per keurmerk dat vooraf in de keuzes staat (veld `voorinvulling` in `items.json`). **13 keurmerken** = 12 met aanwezig/afwezig/onzeker (ronde 9: na V-label FSC, Triman, kunststofcode, PlanetProof) plus Nutri-Score. **Na te lopen** = een etiket dat al bevestigd is maar waarvan minstens één van de vier nieuwe keurmerken nog niet bevestigd is (toetsset §6). **Uitsnede** = een hinttegel uit `items.json` (`hint`); de bestandsnaam eindigt op `-<CODE>-<tegelnummer>.png` en wordt van rechts gelezen (de etiketcode bevat zelf streepjes). **Tegelvlak** = `herken.tegels(breedte, hoogte)` (1024 px, overlap 256) op de ware maat van het etiketbeeld, tegelnummer = index in die lijst.

Ongewijzigd:

- het antwoordmodel: per keurmerk aanwezig / afwezig / onzeker, Nutri-Score als letters A–E of "onleesbaar", status bevestigd / onleesbaar, opmerking, `veranderd`;
- het schema van `uitslag.json`;
- de server-API: `/`, `items.json`, `/stand`, `/opslaan`, beelden;
- de conceptsleutel `concept:<id>` in `sessionStorage`; een concept in een open tabblad overleeft daardoor de wissel naar de nieuwe pagina;
- bestaande selectors: `keuze-<CODE>` (radiogroepen, vaste volgorde), `ns-A`…`ns-E`, `ns-onleesbaar`, `stand-<CODE>` met `data-met`/`data-zonder` en zichtbare tekst met 16 en 50, alle 13 binnen een element `#standen`; `etiket-id`; `overzicht` binnen de link `volledig`; `#opmerking`, `#voortgang`, `#opslaan`, `#onleesbaar`, `#melding`, `#notitie`; `#keuzes` `inert` tot klaar.

### Wat iemand typt of kiest raakt nooit kwijt

Ongewijzigd uit toetsset §6 en hier bindend: geen `focus()`/`select()` op een ander veld dan waar de invuller staat; geen ouder van een invoerveld vervangen (alleen de uitsnedekolom en de kaders op het beeld worden per etiket opnieuw gevuld, en die bevatten geen invoervelden); AI-merkje, "gewijzigd", stand en status staan elk in een eigen element zonder invoerveld en worden alleen via `textContent`, `hidden` of attributen bijgewerkt; elk concept in `sessionStorage` gaat bij laden vóór; herbouwen alleen na opslaan.

Eén toevoeging: bij het wisselen van etiket (←/→, `b`, "Bevestigen en volgende") mag de pagina `blur()` doen op een eigen knop of keuze in het paneel die de focus heeft, zodat Spatie of Enter niet ongezien op het volgende etiket werkt. Nooit op een tekstveld; het wisselen gebeurt ook nooit vanuit een tekstveld.

## Information Architecture

Eén scherm, drie kolommen onder één kopregel:

| Vlak | Inhoud | Doel |
|---|---|---|
| Kopregel | titel, voortgang, positie, status van het etiket, etiketcode | waar ben ik, hoe ver ben ik |
| Etiketbeeld | het etiket, kaders op de AI-plekken, inzoomen | het etiket zelf beoordelen |
| AI-uitsneden | de uitsneden waarin de AI een keurmerk zag, met naam | snel zien wat de AI bedoelt |
| Beoordelingspaneel (`#keuzes`) | melding geen voorinvulling of 'na te lopen'; 13 keurmerkrijen (binnen `#standen`) met keuze, AI-merkje, "gewijzigd" en stand; opmerking; knoppen; melding; sneltoetsenregel | kiezen en bevestigen |

De oude losse standenbalk vervalt: de stand per keurmerk staat in de eigen rij.

## Voice and Tone

Kort, Nederlands, zonder vakjargon.

| Doen | Niet doen |
|---|---|
| "9 van 352 etiketten afgehandeld" (bestaand) | "Progress: 9/352" |
| "gewijzigd" | "override" |
| "AI: geen letter" | "AI: []" |

Bestaande meldingsteksten blijven letterlijk staan, bijvoorbeeld "Opgeslagen (bevestigd)." (tests en Friso's gewenning); alleen de weigermelding bij bevestigen noemt sinds ronde 9 de 12 keurmerken (zie Nalopen); geen bestaande test controleert de oude tekst letterlijk (gezocht in `tests/`, 02-11-2026). Een melding over opslaan noemt daarnaast de etiketcode als het verzoek bij een ander etiket hoort dan het getoonde.

## Component Patterns

| Component | Gedrag |
|---|---|
| Keurmerkrij | Klik ergens in de rij, of focus die binnen de rij komt (Tab), maakt hem actief. Actief is een visuele markering, geen `focus()`. |
| Segmentknop | Per keurmerk één segmentknop (technisch drie radio-inputs) (`data-testid="keuze-<CODE>"`, `role="radiogroup"`, `aria-label` = keurmerknaam, volgorde ongewijzigd). De radio-inputs blijven bedienbaar: onzichtbaar maar met echte afmeting over de knop heen, niet `display:none`. Ongewijzigd: klik kiest en slaat direct op als tussenstand. Pijltoetsen op een segmentknop met focus veranderen de keuze niet: ze bedienen etiket- en rijnavigatie. |
| AI-merkje | Op de knop of letter die overeenkomt met de AI-voorinvulling. |
| "gewijzigd" | Zichtbaar precies als de code in `veranderd` zit, met dezelfde functie die ook bij opslaan `veranderd` bepaalt. |
| Stand | `stand-<CODE>` in de rij: "mét 3/16 · zonder 12/50"; groen bolletje als beide gehaald. |
| Nutri-Score-rij | Vijf aan/uit-letters (`ns-A`…`ns-E`) en "letter onleesbaar" (`ns-onleesbaar`). Ongewijzigd: checkboxes, zelfde bedienbaarheid als de radio-inputs. Een letter aan- of uitzetten zet "letter onleesbaar" uit; "letter onleesbaar" aan laat de letters staan maar gedempt (opgeslagen wordt dan "onleesbaar"). |
| Etiketbeeld | Zie de paragraaf *Etiketbeeld* onder deze tabel. Cmd-klik (Mac), Ctrl-klik of middenklik opent de volledige resolutie (`data-testid="volledig"` blijft de link om `data-testid="overzicht"`). |
| Uitsnede | Klik = het beeld zoomt in op het AI-kader van die uitsnede (zie *Etiketbeeld*) en de rij van dat keurmerk wordt actief. Uitsneden van de actieve rij vallen op. Is code of tegelnummer niet uit de bestandsnaam te lezen of buiten het tegelvlak, dan staat de uitsnede er zonder kader en rijkoppeling (de naam staat er alleen als code én tegelnummer geldig zijn; vóór het laden van het beeld al op grond van de bestandsnaam). Geen uitsneden → kolom vervalt en het beeld wordt breder. |
| Hoofdknop "Bevestigen en volgende" (`#volgende`) | Binnen `#keuzes`. Doet precies wat sneltoets `b` doet: bevestigen zoals ingevuld en meteen naar het volgende etiket (volgend nummer, niet het volgende open etiket); is niet alles gekozen, dan niet opslaan en niet verder. Op het laatste etiket: bevestigen en blijven staan. |
| Knop "Bevestigen" (`#opslaan`) | Ongewijzigd: bevestigt en blijft op dit etiket (handig om een eerder etiket te corrigeren). |
| Knop "Etiket onleesbaar" (`#onleesbaar`) | Ongewijzigd: slaat status onleesbaar op en blijft staan. |
| Opmerkingveld | Ongewijzigd: elke toetsaanslag als concept; sneltoetsen werken hier nooit. 2 regels hoog. |

### Etiketbeeld

Ronde 8 (Friso 02-11-2026, letterlijk: "Het etiket is te groot, deze moet inzoomen tot 100% breedte of hoogte.").

- **Beginstand passend:** bij elk getoond etiket staat het hele etiket in het beeldvak: schaal = min(binnenbreedte vak / breedte etiket, binnenhoogte vak / hoogte etiket), met de binnenmaat van het vak (zonder rand of scrollbalk). Het etiket raakt dus 100% van de breedte óf de hoogte, verhouding behouden, niets afgesneden, geen scrollbalk, in beide richtingen gecentreerd. Een klein etiket (bijvoorbeeld 428×354) wordt vergroot; een heel hoog etiket (bijvoorbeeld 842×9179) wordt een smalle, volledige strook; details via de uitsneden of door in te zoomen.
- **AI-kaders:** op de plek van elke uitsnede een AI-kader, in procenten van de ware maat zodat het met het beeld meeschaalt. Alle AI-kaders van de actieve rij zijn gemarkeerd en liggen bovenop de andere (ook als twee keurmerken dezelfde tegel delen). Bij een rijwissel (↑/↓, klik of Tab in een rij) gaat de markering naar de AI-kaders van de nieuwe actieve rij; het beeld zelf zoomt of verschuift niet, ook niet als het ingezoomd is. AI-kaders verschijnen pas als het beeld van het getoonde etiket geladen is; het beeld wordt pas zichtbaar in de beginstand.
- **Inzoomen alleen op verzoek:** klik op het beeld = ingezoomd op het aangeklikte punt; breedte = max(ware breedte, 3× de passende breedte), met de passende breedte berekend uit beeld- en vakmaat. Een gewone klik naast het etiket (in de witte rand) doet niets; daar staat ook geen zoomcursor. Klik op een uitsnede = ingezoomd met dat AI-kader zo veel mogelijk in het midden, ook als het beeld al ingezoomd is. Alleen een klik op het ingezoomde beeld of Esc gaat terug naar passend.

## State Patterns

| Toestand | Weergave |
|---|---|
| Laden | Ongewijzigd: `#keuzes` is `inert` tot het eerste etiket getoond is en de sneltoetsen gekoppeld zijn (het bestaande klaar-teken). |
| Laden mislukt / geen etiketten | Ongewijzigd: tekst in de voortgang; `#keuzes` blijft `inert`. |
| Etiket zonder AI-voorinvulling | Ongewijzigd: melding in `#notitie` in rood; geen AI-merkjes; alles zelf kiezen. |
| Keurmerk zonder AI-oordeel (model liet het weg) | Geen merkje in die rij en de tekst "AI: —". |
| AI zag geen Nutri-Score-letter | Geen merkje op een letter, de tekst "AI: geen letter". |
| AI zag een keurmerk, maar er is geen uitsnede (bijvoorbeeld V-label afgeleid) | Rij wel teal gemarkeerd; geen kader. |
| Etiket zonder uitsneden | Uitsnedekolom vervalt; geen kaders op het beeld. |
| Etiketbeeld niet te laden | Tekst "Beeld niet te laden" in het beeldvak; keuzes blijven bruikbaar. |
| Etiket al bevestigd / onleesbaar | Statusmerkje in de kopregel. |
| Keuze wijkt af van AI | "gewijzigd" in de rij (zie Component Patterns). |
| Doel gehaald voor een keurmerk | Groen bolletje bij de stand. |
| Opslaan mislukt | Bestaande foutmelding; invoer en concept blijven; de etiketcode staat erbij als het een ander etiket is dan het getoonde. |
| Laatste etiket | `b` en "Bevestigen en volgende" slaan op en blijven staan. |
| Alle etiketten afgehandeld | Voortgang "352 van 352 etiketten afgehandeld"; verder niets bijzonders. |
| Passend (beginstand) | Zie *Etiketbeeld*. |
| Ingezoomd | Alleen op verzoek (zie *Etiketbeeld*). Het beeldvak scrollt intern; een ander etiket begint altijd passend. |
| Beeldvak verandert van maat (venster, browserzoom) | Passend: opnieuw passend. Ingezoomd: zoom en scrollpositie blijven. |

## Interaction Primitives

Sneltoetsen werken niet zolang de cursor in een tekstveld staat, niet in combinatie met Ctrl, Cmd of Alt, en niet als herhaling van een ingedrukt gehouden toets (behalve ←/→ en ↑/↓).

| Toets | Werking |
|---|---|
| ← / → | vorig / volgend etiket (ook als een segmentknop of letter de focus heeft) |
| ↑ / ↓ | vorige / volgende keurmerkrij actief maken; de markering gaat naar de AI-kaders van die rij (het beeld zelf zoomt of verschuift niet) |
| 1 / 2 / 3 (een van de 12 rijen actief) | aanwezig / afwezig / onzeker; daarna wordt de volgende rij actief, maar nooit automatisch de Nutri-Score-rij (na de laatste van de 12 blijft die actief) |
| 1–5 en 0 (Nutri-Score-rij actief) | letter A–E aan/uit; 0 = letter onleesbaar aan/uit; geen automatische rijwissel |
| 4 / 5 / 0 buiten de Nutri-Score-rij | niets |
| b | bevestigen zoals ingevuld en door naar het volgende etiket |
| Esc | beeld terug naar passend |

Een keuze via het toetsenbord volgt exact dezelfde weg als een klik: concept bewaren en direct opslaan als tussenstand. Bij het openen van een etiket is de eerste rij actief. Enter of Spatie op de hoofdknop met focus doet wat een klik doet; daarom haalt het wisselen van etiket de focus van die knop (Foundation).

## Accessibility Floor

- Alles is met het toetsenbord te bedienen; Tab-volgorde volgt de leesvolgorde in het paneel, en Tab in een rij maakt die rij actief.
- Radiogroepen houden `role="radiogroup"` en een `aria-label` met de keurmerknaam; de melding is `role="status"`.
- Zichtbare focusring op knoppen en segmentknoppen. Geen informatie alleen in kleur: AI-merkje heeft de tekst "AI", gewijzigd heeft het woord "gewijzigd".
- De pagina geeft nooit zelf een ander element de focus (alleen `blur()` bij etiketwissel, zie Foundation).

## Responsive & Platform

Een scherm van 1440×900 geeft in een browser met adresbalk en bladwijzers een venster van ongeveer 1440×800; 1920×1080 ongeveer 1920×970. Het ontwerp moet in die vensters passen.

| Venster | Gedrag |
|---|---|
| < 1280 breed | Niet ontworpen; de pagina mag dan krap worden. |
| 1280–1439 breed | Zelfde indeling; het etiketbeeld wordt smaller. Niet getoetst. |
| ≥ 1440 breed en ≥ 800 hoog | Volledige indeling zonder paginascroll; getoetst op vensters 1440×800 en 1920×970, schermafbeeldingen op 1440×900 en 1920×1080. |

## Inspiration & Anti-patterns

- **Afgewezen (oude pagina):** etiket als smalle strook van miniaturen; uitsneden onder de vouw; drie rondjes onder elkaar per keurmerk; AI-oordeel in een losse kolom die van het scherm valt; een hele regel voor de standen.
- **Overgenomen (oude pagina):** opslaan per keuze, concepten, klaar-teken, sneltoets b.

## Key Flows

### Flow 1 — Friso keurt een etiket goed waar de AI gelijk heeft

1. Friso opent de pagina; die springt naar het eerste open etiket.
2. Links staat het hele etiket passend in beeld, met twee AI-kaders; die van EU-biologisch (de actieve rij) zijn gemarkeerd. In de middenkolom de twee uitsneden "EU-biologisch".
3. In het paneel is de rij EU-biologisch teal gemarkeerd; "Aanwezig" is gekozen en draagt het AI-merkje. Nutri-Score staat op C met AI-merkje.
4. Hij kijkt naar de uitsneden en ziet het EU-blad.
5. **Hoogtepunt:** hij drukt `b`. Het etiket is bevestigd, de voortgang telt op en het volgende etiket staat in beeld, zonder een keer te scrollen.

Fout: opslaan mislukt → rode melding met de etiketcode, concept blijft; met ← terug en opnieuw `b`.

### Flow 2 — Friso corrigeert de AI

1. Op het volgende etiket staat Groene Punt op "Afwezig", maar in het passende beeld ziet hij rechtsonder iets dat erop lijkt.
2. Hij klikt op die plek in het beeld; het beeld zoomt daar in. Het is Groene Punt.
3. Hij klikt in de rij Groene Punt op "Aanwezig" (of: ↓ naar de rij en `1`). De rij toont "gewijzigd"; de keuze is al als tussenstand opgeslagen.
4. Esc brengt het beeld terug naar passend.
5. **Hoogtepunt:** "Bevestigen en volgende"; `veranderd` bevat GREEN_DOT, het volgende etiket staat klaar.

Fout: hij drukt `b` terwijl hij nog een opmerking typt → er gebeurt niets in het veld behalve de letter b; om te bevestigen klikt hij eerst buiten het veld.

## Nalopen (ronde 9)

- De kopregel toont naast "X van 352 etiketten afgehandeld" het aantal na te lopen etiketten ("· N na te lopen"), alleen als dat er is. Afgehandeld = bevestigd met alle 13 keuzes, of onleesbaar.
- Bij openen staat de pagina op het eerste etiket dat niet afgehandeld of na te lopen is.
- Op een na te lopen etiket: de keuzes van de server staan in de 9 oude rijen, de vier nieuwe tonen de voorinvulling; de eerste nieuwe rij zonder bevestigde keuze is actief; de notitie zegt "Al bevestigd: controleer alleen de vier nieuwe keurmerken (FSC, Triman, kunststofcode, PlanetProof)." "Bevestigen en volgende" (of `b`) slaat alles op, de oude antwoorden ongewijzigd.
- Zonder voorinvulling voor de vier (mislukt of nog niet gedraaid): de vier rijen zonder keuze en met "AI: —"; bevestigen vraagt eerst een keuze.
- De weigermelding bij bevestigen zonder alle keuzes wordt: "Kies eerst bij alle 12 keurmerken (ook het V-label en de vier nieuwe) en bij Nutri-Score; niets opgeslagen."

