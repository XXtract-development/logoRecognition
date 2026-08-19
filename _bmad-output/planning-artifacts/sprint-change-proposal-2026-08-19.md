---
titel: Sprint Change Proposal — Epic 20 alsnog vastleggen
datum: 2026-08-19
project: logoRecognition
aanleiding: driftcontrole op de sprintstatus, 19 augustus 2026
scope: Moderate — backlog-registratie, geen inhoudelijke koerswijziging
status: goedgekeurd en doorgevoerd (Friso, 19 augustus 2026)
---

# Sprint Change Proposal — Epic 20 alsnog vastleggen

> [!warning]
> Er zijn **negentien stories gebouwd onder een epic dat nergens in de planning bestaat**. Een deel
> ervan draait sinds 27 juli op de acceptatie-omgeving. Dit voorstel legt achteraf vast wat er
> gebouwd is en waarom, zonder de koers zelf te wijzigen.

## 1. Wat er aan de hand is

**Het probleem, precies.** `sprint-status.yaml` kent een `epic-20: in-progress` met negentien
stories. Epic 20 komt **niet** voor in `epics.md`, **niet** in `epics-vliegwiel.md`, **niet** in
`prds/prd-logoRecognition-2026-07-02/`. De scoperegel van het volgbestand zelf luidt:

> `# scope: Epic 7-12 + Epics 13-18 Referentie-vliegwiel + Epic 19 Gerichte brandstofselectie
> (correct-course 2026-07-04)`

Epic 20 staat daar niet in.

**Categorie:** geen technische beperking en geen koerswijziging, maar **een misverstand over de
registratie**. Het werk zelf is verdedigbaar en grotendeels opgeleverd; wat ontbreekt is de
vastlegging.

**Hoe het is ontdekt.** Op 19 augustus 2026 vroeg Friso de sprintstatus op. Bij het beantwoorden
bleek epic 20 wél in het volgbestand te staan en nergens in de planning.

### Het bewijs, en een besluit dat dit voorzag

`VERIFIED` — de enige plek in de hele planningsmap waar "Epic 20" voorkomt is
`sprint-change-proposal-2026-07-07.md`, en daar staat het onder **Alternatief overwogen**:

> "Een nieuw **Epic 20** i.p.v. uitbreiding van Epic 19 — verworpen voor nu: dezelfde doelstelling
> (het vliegwiel produceert bruikbare brandstof), Epic 19 is al in-progress met de hele keten.
> **Optie blijft open als de lijn verder groeit.**"

Die laatste zin is de kern. De lijn ís verder gegroeid — met negentien stories — precies het geval
waarvoor 7 juli de deur openhield. Er is alleen nooit door die deur gelopen op papier.

**En de doelstelling is inmiddels wél een andere dan die van epic 19.** Epic 19 gaat over
*wélke* etiketten je verwerkt (gerichte, gebalanceerde selectie via declaraties). De negentien
stories van epic 20 gaan over iets anders: *of een mens die selectie daadwerkelijk kan beoordelen*,
en *of de toevoer niet stilzwijgend opdroogt*. Het argument van 7 juli ("dezelfde doelstelling")
gaat voor deze negentien dus niet meer op.

## 2. Impactanalyse

### Epic-impact

| epic | stand | oordeel |
|---|---|---|
| **Epic 20** | 19 stories, niet gedefinieerd | **moet alsnog vastgelegd** — kern van dit voorstel |
| Epic 19 | `done`, retrospectief `done` — maar **19.16 staat op `review`** | afgesloten met één story open; hoort benoemd |
| Epic 13 | stond op `in-progress` terwijl 13.1 t/m 13.10 alle tien `done` zijn | **al gecorrigeerd** op 2026-08-19 (commit `2e72194`) |
| Epic 10, 11 | `backlog`, 6 stories, nooit begonnen | bewuste volgorde, géén drift — geen actie |
| Epic 12 | `done`; 12.5 en 12.6 uitgesteld naar fase 2 | bewust besloten bij de afsluiting — geen actie |

### Story-impact

**Zestien stories staan op `review` in plaats van `done`.** Vijftien daarvan in epic 20, plus 19.16.
Van 20.11 t/m 20.14 is vastgelegd dat ze op 2026-07-27 gebouwd **én uitgerold** zijn. Dat is dus geen
technische achterstand maar een administratieve: de laatste poort is niet dichtgetrokken.

Verder aangetroffen, klein maar verwarrend:

- **`20-2-sampler-run-en-vullen-categorie-3`** staat op `in-progress` maar heeft **geen story-bestand**;
  de hele voortgang zit in een commentaarregel in het volgbestand.
- **Twee bestanden claimen nummer 20.15**: `20-15-beoordeelscherm-echt-bruikbaar.md` (superseded) en
  `20-15-meetbare-opmaaktest-beoordeelscherm.md` (review).
- **20.18** is afgekeurd (superseded, niet bouwen) en **20.19** zit in de specificatiefase; beide
  ontbraken tot 2026-08-19 volledig in het volgbestand en zijn daar toen toegevoegd.

### Artefactconflicten

| artefact | conflict |
|---|---|
| `epics-vliegwiel.md` | kent epic 13 t/m 19; epic 20 ontbreekt in de Epic List én als sectie |
| `prds/…/addendum.md` §1 | kent FR-1 t/m FR-22; de doelstelling van epic 20 heeft geen eis |
| `sprint-status.yaml` scoperegel | noemt epic 7-12, 13-18, 19 — niet 20 |
| `epics.md` | gaat over epic 7 t/m 11; niet geraakt |
| `architecture.md` | niet geraakt — epic 20 introduceert geen nieuwe bouwstenen |

### Technische impact

**Geen.** Dit voorstel wijzigt geen code, geen infrastructuur en geen uitrol. Alles wat gebouwd is
blijft staan.

## 3. Aanbevolen aanpak

**Direct Adjustment — vastleggen wat er is, geen terugdraaiing en geen scopewijziging.**

De drie alternatieven zijn gewogen:

| optie | oordeel |
|---|---|
| **Direct Adjustment** — epic 20 alsnog definiëren | **gekozen.** Het werk is verdedigbaar, grotendeels opgeleverd en deels live. Terugdraaien zou waarde vernietigen om een registratiefout te herstellen |
| Potential Rollback — de negentien stories terugdraaien | verworpen. Onevenredig: er is geen inhoudelijk bezwaar tegen het werk, alleen tegen de registratie |
| MVP Review — scope verkleinen | verworpen. De MVP (het vliegwiel) is niet in het geding; epic 20 maakt hem bruikbaar |

**Inspanning:** een halve dag registratiewerk. **Risico:** laag — geen code, geen uitrol.
**Doorlooptijd:** geen effect op de levering; 20.19 kan er direct na verder.

**Waarom dit vóór de bouw van 20.19 gaat:** 20.19 is zélf een ongeplande story in een ongepland
epic. Zolang dat zo is, is niet vast te stellen wat er is afgesproken — en dat is precies waar deze
ronde op stukliep.

## 4. Concrete wijzigingsvoorstellen

### 4.1 PRD-addendum §1 — twee nieuwe eisen

Epic 20 dekt een doelstelling die geen enkele bestaande eis draagt. Precedent: **FR-22 is op
2026-07-04 op exact deze manier toegevoegd via een correct-course**, met een rij in het addendum.

**NIEUW — FR-23: Een werkbare beoordeelronde**

> De mens die beoordeelt moet dat op een telefoon kunnen doen zonder tegen het scherm te vechten:
> het artwork groot genoeg om een keurmerk te herkennen, alle bediening in beeld, een getekend
> kader dat samen met een keurmerkkeuze ingediend kan worden, en een voorbeeldlogo dat er altijd is
> en van de juiste herkomst. De opmaak wordt **gemeten**, niet op het oog beoordeeld.

**NIEUW — FR-24: Continuïteit van de oogst**

> De oogst die de beoordeelwachtrij vult mag niet stilzwijgend stoppen of vervuilen: geen
> mislabels van gelijkende iconen, geen technische snijlijnpagina's, geen stille dood door de
> geheugengrens, en als de declaratiebron wegvalt is dat zichtbaar en herstelbaar.

### 4.2 `epics-vliegwiel.md` — Epic 20 aan de Epic List en als sectie

```
## Epic 20: Een werkbare beoordeelronde en een oogst die blijft leveren

Epic 19 zorgt dat we de JUISTE etiketten verwerken. Epic 20 zorgt dat een mens ze ook daadwerkelijk
kan beoordelen, en dat de toevoer niet opdroogt. Twee sporen: (a) het beoordeelscherm — bruikbaar op
een telefoon, met gemeten opmaak in plaats van een oogtoets; (b) de oogst — geen mislabels, geen
snijlijnpagina's, geen stille uitval, en een declaratiebron die te repareren is als hij wegvalt.
(FR-23 + FR-24 · voortbouwend op FR-22 · ARCH-4)

**FRs covered:** FR-23, FR-24

**Volgorde:** de twee sporen lopen onafhankelijk. Binnen spoor (a) geldt 20.15 (de meetbare
opmaaktest) als voorwaarde voor 20.16 en 20.17 — zonder meting is opmaak niet toetsbaar.
```

**Spoor (a) — het beoordeelscherm (12 stories)**

| story | onderwerp |
|---|---|
| 20.3 | mobiele crop-flow zonder swipe-conflict |
| 20.4 | getekend kader alleen via de hoofdknop, met keurmerkkeuze vooraf |
| 20.5 | correctie terugtonen en het keurmerk expliciet op de knop |
| 20.6 | beeld-endpoints revalideren in plaats van blind cachen |
| 20.8 | voorbeeldlogo altijd aanwezig |
| 20.10 | "geen keurmerk" afwijzen werkt ook zonder kader |
| 20.12 | artwork paginabreed tonen |
| 20.13 | voorbeeldlogo kiezen op herkomst, niet op alfabet |
| 20.14 | het scherm vult de beschikbare hoogte |
| 20.15 | een test die de opmaak écht meet |
| 20.16 | alle bediening in beeld, beeld niet afgekapt |
| 20.17 | contextbeeld dat een klein keurmerk groot toont |

**Spoor (b) — de oogst (7 stories)**

| story | onderwerp |
|---|---|
| 20.1 | gids-zaad en declaratiemeting voor categorie 3 |
| 20.2 | sampler-run en het vullen van categorie 3 |
| 20.7 | cross-code-guard tegen mislabels van gelijkende iconen |
| 20.9 | keyline-guard — snijlijnpagina's uit de oogst |
| 20.11 | de oogst mag niet door de geheugengrens gedood worden |
| ~~20.18~~ | **vervallen** — afgekeurd op 2026-08-18, aanname weerlegd (0 van 62 opgelost) |
| 20.19 | declaraties uit een momentopname van de trade-item-database |

### 4.3 `sprint-status.yaml` — scoperegel

```
OUD: # scope: Epic 7-12 + Epics 13-18 Referentie-vliegwiel + Epic 19 Gerichte brandstofselectie
     (correct-course 2026-07-04) (Epic 1-6 afgerond, …)

NIEUW: # scope: Epic 7-12 + Epics 13-18 Referentie-vliegwiel + Epic 19 Gerichte brandstofselectie
       (correct-course 2026-07-04) + Epic 20 Werkbare beoordeelronde en continuïteit van de oogst
       (correct-course 2026-08-19) (Epic 1-6 afgerond, …)
```

### 4.4 Registratiepunten die apart worden vastgelegd

| punt | voorstel |
|---|---|
| **Zestien stories op `review`** | Eén afsluitveeg **ná** 20.19: per story vaststellen of gebouwd, beoordeeld én uitgerold. Wat compleet is gaat op `done`; wat een gat heeft krijgt de reden erbij. Geen groepsgewijze goedkeuring |
| **19.16 open onder een gesloten epic 19** | Blijft bij epic 19; gaat mee in dezelfde afsluitveeg. Epic-19-status blijft `done` met de uitzondering benoemd |
| **20.2 zonder story-bestand** | Story-bestand alsnog aanmaken uit de commentaarregel, of de status terugzetten naar `backlog` als er niets loopt |
| **Dubbel nummer 20.15** | `20-15-beoordeelscherm-echt-bruikbaar.md` hernummeren of expliciet als voorganger markeren |
| **20.18 en 20.19** | **al toegevoegd** aan het volgbestand op 2026-08-19 (commit `2e72194`) |
| **Epic 13 op `in-progress`** | **al gecorrigeerd** naar `done` op 2026-08-19 (commit `2e72194`) |

## 5. Implementation Handoff

**Scope: Moderate** — backlog-registratie, geen inhoudelijke koerswijziging. Route: Product Owner
plus ontwikkelaar; geen architect nodig, want er verandert niets aan de bouwstenen.

**Wat er na goedkeuring gebeurt, in volgorde:**

1. FR-23 en FR-24 in het PRD-addendum §1 (patroon van FR-22, 2026-07-04).
2. Epic 20 in `epics-vliegwiel.md`: Epic List plus volledige sectie met de negentien stories.
3. Scoperegel in `sprint-status.yaml`.
4. De vier registratiepunten uit 4.4 die nog openstaan.
5. **Daarna pas** verder met 20.19 (bouwen plus code review), en dáárna de afsluitveeg over de
   zestien.

**Succescriterium:** wie morgen de sprintstatus opvraagt krijgt een antwoord waarin elke story een
epic heeft, elk epic een doel, en elke afwijking een reden. Concreet toetsbaar: geen enkele regel in
`sprint-status.yaml` verwijst nog naar een epic dat niet in een planningsdocument staat.

`VERIFIED, 2026-08-19` — het criterium is gehaald. Alle veertien epics in het volgbestand (7 t/m 20)
hebben nu een sectie in `epics.md` of `epics-vliegwiel.md`. De toets bracht epic 12 aan het licht,
dat dezelfde omissie had als epic 20; ook dat is vastgelegd.

**Randvoorwaarden:** geen code- of uitrolwijziging in dit spoor; de negentien stories blijven staan
zoals ze zijn.

## Besluiten (Friso, 19 augustus 2026)

Alle drie de punten zijn beslist; er staat niets meer open.

1. **Het voorstel is goedgekeurd en doorgevoerd.**
2. **Epic 10 en 11 worden ingepland ná epic 20.** Ze stonden sinds juni stil zonder dat vastlag of
   dat bewust was. Het is nu een bewuste volgorde en geen achterstand meer: modelbewaking en
   automatische terugdraaiing worden belangrijker naarmate het vliegwiel meer zelf promoveert.
   Vastgelegd bij `epic-10` en `epic-11` in het volgbestand.
3. **Fase 2 krijgt een aanzet.** 12.5 en 12.6 blijven uitgesteld, maar het voorbereidende werk
   begint: de labelkandidaten klaarzetten en het beoordeelscherm erop inrichten, zodat er alleen nog
   doorlopen hoeft te worden. Het labelen zelf blijft mensenwerk met de PO als eigenaar. Vastgelegd
   bij `12-5` en `12-6`.

## Wat er is doorgevoerd

| document | wijziging | stand |
|---|---|---|
| `prds/prd-…-2026-07-02/addendum.md` §1 | FR-23 en FR-24 toegevoegd, patroon van FR-22 | **gedaan** |
| `epics-vliegwiel.md` | Epic 20 in de Epic List én als volledige sectie met beide sporen | **gedaan** |
| `sprint-status.yaml` scoperegel | Epic 20 toegevoegd, met de FR-verwijzing | **gedaan** |
| `sprint-status.yaml` epic-10 / epic-11 | besluit "ingepland na epic 20" vastgelegd | **gedaan** |
| `sprint-status.yaml` 12-5 / 12-6 | besluit "aanzet maken" vastgelegd | **gedaan** |
| `sprint-status.yaml` epic-19 | uitzondering benoemd: 19.16 staat nog open onder een gesloten epic | **gedaan** |
| `sprint-status.yaml` 20-2 | ontbrekend story-bestand benoemd, met de actie erbij | **gedaan** |
| `sprint-status.yaml` epic-13, 20-18, 20-19 | drift gecorrigeerd | **gedaan** (commit `2e72194`) |
| `epics-vliegwiel.md` | **Epic 12 alsnog vastgelegd** — bij het toetsen van het succescriterium bleek epic 12 (28 items, afgerond 2026-07-16 mét retrospectief) dezelfde omissie te hebben als epic 20: wél in het volgbestand, in geen enkel epic-overzicht. Korte registratie-entry met verwijzing naar het retrospectief | **gedaan** |
| Dubbel nummer 20.15 | **geen actie nodig** — het vervallen bestand draagt "(VERVALLEN)", status `superseded`, en verwijst naar zijn drie opvolgers | gecontroleerd |

**Wat hierna komt, in volgorde:** 20.19 afbouwen (bouwen plus code review) → de afsluitveeg over de
zestien stories op `review`, inclusief 19.16 → epic 10 → epic 11. De aanzet voor fase 2 loopt daar
los naast.

## Change Log

- 2026-08-19: Aangemaakt na de driftcontrole op de sprintstatus.
