# Verzoek: vaste leestoegang van acceptatie tot de trade-item-database

**Datum:** 19 augustus 2026
**Vraag:** uitbreiding van het akkoord van 4 juli 2026
**Betreft:** keurmerkherkenning (logoRecognition), het vullen van de beoordeelwachtrij

---

## Waar het om gaat, in één alinea

De keurmerkherkenning leert van beoordeelde voorbeelden. Die voorbeelden komen uit producten
waarvan bekend is dat ze een keurmerk voeren — dat staat in de GS1-declaratie. Sinds 27 juli
levert die bron niets meer op en staat de beoordeelwachtrij leeg. De oorzaak is gemeten: voor
**442 producten** kan de declaratie niet gelezen worden, omdat het XML-bestand waaruit we lezen
niet meer bestaat. De gegevens zelf zijn er wel — in de trade-item-database.

## Wat is gemeten

| | |
|---|---|
| Producten met artwork op acceptatie | 1874 |
| Waarvan bruikbaar via de huidige route | 848 |
| **Onleesbaar door een ontbrekend XML-bestand** | **442** |
| Daarvan met een document in de database, onder onze eigen GLN | **442 (100%)** |
| **Daarvan met een daadwerkelijke keurmerkdeclaratie** | **238 (54%)** — 475 codes |

Het bestand ontbreekt ook op productie; het is dus niet op te lossen door beter te zoeken. Twee
alternatieve verklaringen zijn getoetst en verworpen: een verouderde GLN (0 van 62 opgelost) en
een te kleine index (+29 producten).

## Wat er gevraagd wordt

Een **leesrechten-gebruiker** op `application.tradeItems`, gebruikt door de
acceptatie-omgeving. Concreet:

- **Alleen lezen.** Geen enkele schrijfbewerking; de rol is `read` op één database.
- **Opzoeken op sleutel, niet zoeken.** Per product één `find` op de primaire sleutel
  (`{gln}-{gtin}-{doelmarkt}`). Gemeten: **0 ms** per opzoeking. Er wordt uitdrukkelijk **niet**
  gescand — de scan die in het script van 4 juli zit (een reguliere expressie over de hele
  collectie, 51 seconden per aanroep) wordt hier niet gebruikt.
- **Volume:** ten hoogste enkele honderden opzoekingen per indexbouw, en die draait niet continu.
- **Netwerk:** het pad bestaat al; de acceptatie-container bereikt de database over het interne
  netwerk. Er hoeft niets opengezet te worden.

## Wat er verandert ten opzichte van 4 juli

Het akkoord van 4 juli gold een **eenmalige, handmatige leesactie buiten piekuren**; in de kop van
dat script staat expliciet "NOOIT automatisch". Dit verzoek maakt er een **terugkerende
leesactie** van, uitgevoerd door de applicatie zelf. Dat is de kern van de vraag en de reden dat
dit opnieuw wordt voorgelegd in plaats van onder het oude akkoord te vallen.

## Alternatieven, en waarom ze afvallen

| Alternatief | Waarom niet |
|---|---|
| Het XML-bestand alsnog vinden | Bestaat nergens meer, ook niet op productie |
| Een nieuwere GLN opzoeken | Gemeten: 0 van 62 opgelost |
| De index opnieuw bouwen | +29 producten, +1 keurmerkcode |
| **Eenmalige handmatige oogst** | Blijft binnen het huidige akkoord en levert dezelfde 238 producten, maar herhaalt zich niet bij nieuwe producten — dan staat de wachtrij over een maand weer leeg |

Die laatste is de terugvaloptie als een vaste koppeling niet gewenst is.

## Aandachtspunt dat bij het besluit hoort

De database is **niet identiek** aan de XML. Van 100 vergeleken producten weken er twee af,
waarvan één met een ander codewoord (`RAINFOREST_ALLIANCE` tegenover
`RAINFOREST_ALLIANCE_PEOPLE_NATURE`). De database wordt daarom **alleen** gebruikt waar de XML
ontbreekt, nooit als vervanging van een werkende uitlezing.

## Wat er gebeurt na akkoord

Story 20.19 wordt gebouwd langs de gebruikelijke route (spec-review, bouwen, code review). De
opbrengst wordt vóór en ná gemeten: hoeveel van de 442 alsnog een declaratie opleveren en hoeveel
kandidaten dat in de wachtrij zet. Verwachting op basis van de telling: 238 producten.

---

## Aanvulling, 19 augustus 2026 — ná het akkoord

**Akkoord ontvangen** ("Alles is akkoord", Friso, 19 augustus 2026).

Drie zaken die ná het akkoord gemeten zijn en het besluit raken (zie ook de tweede aanvulling hieronder — de route in punt 1 is inmiddels verlaten):

1. **Het account waarmee tot nu toe gemeten is, is géén leesaccount.** `xxtract` draagt `dbOwner` +
   `readWrite` op `application` en `userAdminAnyDatabase` op `admin`. Die verbindingsreeks mag dus
   niet naar de acceptatie-omgeving — dat zou acceptatie schrijfrechten op productie geven én het
   recht om gebruikers aan te maken. De gevraagde gebruiker met uitsluitend `read` op `application`
   blijft nodig.

2. **De opbrengst is 238 producten, en dat blijft zo.** Een tussenversie van de story versmalde de
   uitlezing tot één veldsoort, wat de opbrengst op 177 zou brengen — 26% minder dan waarop dit
   akkoord is gegeven. Dat is gecorrigeerd (story 20.19, AC5): de versmalling zit nu bij de
   automatische bevestiging, niet bij de bron, dus de beoordeelwachtrij krijgt de volle 238.

3. **Twee alternatieve bronnen zijn nu volledig geteld en definitief dicht.** Van de 429 producten
   met een lege declaratie declareren er op productie **3**; van de 144 met een 404 heeft er
   **0** een document op de sleutel. Beide groepen zijn geen weg meer.

---

## Tweede aanvulling, 19 augustus 2026 — de gevraagde route is verlaten

> [!warning]
> De aanvulling hierboven beschrijft nog een **vaste leesverbinding** vanuit de acceptatie-omgeving.
> Die route is dezelfde dag verlaten. Lees dit blok als de geldende stand.

**Wat er in plaats daarvan gebeurt.** De uitlezing is **één keer met de hand** uitgevoerd, binnen
het akkoord, en het resultaat is als momentopname in de code vastgelegd
(`apps/api/src/services/tradeitem-declaration-snapshot.ts`, 442 sleutels). De acceptatie-omgeving
krijgt **geen** verbinding met productie, **geen** leesgebruiker en **geen** verbindingsreeks.

**Wat daarmee vervalt, en wat niet:**

| | draaiende applicatie | handmatige regeneratie |
|---|---|---|
| leesrechten-gebruiker | niet nodig | **blijft nodig** |
| verbindingsreeks | niet nodig | **blijft nodig** |
| databasedriver | niet nodig | **blijft nodig** |

De leesgebruiker uit het oorspronkelijke verzoek is dus **niet** van tafel — hij is alleen niet
meer nodig om de story te bouwen of uit te rollen, alleen om de momentopname later te verversen.
Zolang dat niet gebeurt, is er geen enkele verbinding tussen acceptatie en productie.

**Tweede besluit, dezelfde dag.** De geoogste gegevens gaan **uitsluitend naar de
beoordeelwachtrij** — niet naar de automatische goedkeuring en niet naar het aanmaken van
referentievoorbeelden. Reden: ze zijn bevroren, en voor deze 442 producten is er geen bestand om ze
tegen af te zetten, terwijl bij een eerdere vergelijking 2 van de 100 producten afweken. De
opbrengst blijft **238 producten**, precies het getal waarop dit akkoord berust; ze passeren alleen
eerst een beoordelaar.

**Correctie op de eerste aanvulling:** die verwijst naar "story 20.19, AC5" voor de versmalling.
Sinds versie 5 bestaat die versmalling niet meer — de automatische bevestiging wordt in het geheel
niet gevoed. De verwijzing is vervallen.
