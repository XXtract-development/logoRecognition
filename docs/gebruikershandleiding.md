# Logo Recognition — Gebruikershandleiding

**Versie:** 1.0
**Datum:** 2026-04-05
**URL:** https://logo-detection.acc.xxtract.com

---

## Overzicht

Het Logo Recognition systeem bestaat uit twee hoofdfuncties:

1. **Logo's trainen** — Upload afbeeldingen, markeer logo's, en train een AI-model
2. **Logo's herkennen** — Upload een afbeelding en laat het systeem automatisch logo's detecteren

---

## Deel 1: Logo's trainen

Het trainingsproces bestaat uit 5 stappen:

### Stap 1: Categorieën aanmaken

Voordat je afbeeldingen uploadt, maak je categorieën aan voor de logo's die je wilt herkennen.

1. Ga naar **Training** in de navigatiebalk
2. Klik op het tabblad **Categorieën**
3. Klik op **Nieuwe Categorie**
4. Vul in:
   - **Naam** — bijv. "Nike", "Adidas", "Apple"
   - **Beschrijving** — optioneel, bijv. "Nike swoosh logo"
   - **Kleur** — kies een kleur voor visuele herkenning
5. Klik op **Opslaan**

Herhaal dit voor elke logo-categorie die je wilt trainen.

> **Tip:** Je kunt later categorieën samenvoegen via de **Merge** knop als je ontdekt dat twee categorieën eigenlijk hetzelfde logo zijn.

---

### Stap 2: Afbeeldingen uploaden

1. Ga naar **Training** → tabblad **Uploaden**
2. Sleep afbeeldingen naar het uploadgebied, of klik om bestanden te selecteren
3. Ondersteunde formaten: **JPG, PNG, WebP** (max 10MB per bestand, max 50 bestanden per keer)
4. Bekijk de uploadwachtrij:
   - Groene status = succesvol geüpload
   - Rode status = mislukt (klik **Opnieuw proberen**)
5. Klik op **Alles uploaden** om de batch te starten

Na het uploaden verschijnen de afbeeldingen in het tabblad **Afbeeldingenbibliotheek**.

---

### Stap 3: Afbeeldingen toewijzen aan categorieën

1. Ga naar **Training** → tabblad **Afbeeldingenbibliotheek**
2. Selecteer afbeeldingen door op de selectievakjes te klikken
3. Klik op **Categorie toewijzen** in de bulk-actiebalk
4. Kies de juiste categorie uit het dropdown-menu
5. Klik op **Toewijzen**

> **Tip:** Gebruik de zoekbalk en filters om snel afbeeldingen te vinden.

---

### Stap 4: Logo's markeren (annoteren)

Dit is de belangrijkste stap — je markeert precies waar het logo zich bevindt op elke afbeelding.

1. Klik op een afbeelding in de bibliotheek om de **Annotatie-editor** te openen
2. Selecteer de juiste **categorie** in het dropdown-menu bovenaan
3. Kies een annotatie-tool:

| Tool | Sneltoets | Gebruik |
|------|-----------|---------|
| **Bounding Box** | `B` | Teken een rechthoek rondom het logo |
| **Smart Click** | `S` | Klik op het logo — het systeem detecteert automatisch de grens |
| **Selecteren** | `V` | Selecteer en verplaats bestaande annotaties |

4. **Bounding Box tekenen:**
   - Klik en sleep om een rechthoek rondom het logo te tekenen
   - Laat los om de annotatie te maken
   
5. **Smart Click gebruiken:**
   - Klik op het midden van het logo
   - Het systeem toont een automatisch gedetecteerde grens
   - Bevestig of pas aan

6. Controleer je annotaties in de zijbalk rechts
7. Verwijder foute annotaties met de prullenbak-knop of `Delete`-toets
8. Klik op **Opslaan** (`Ctrl+S`)
9. Navigeer naar de volgende afbeelding met `→` of `]`

**Handige sneltoetsen:**

| Toets | Actie |
|-------|-------|
| `Ctrl+S` | Opslaan |
| `Ctrl+Z` | Ongedaan maken |
| `Ctrl+Shift+Z` | Opnieuw doen |
| `+` / `-` | In-/uitzoomen |
| `0` | Zoom resetten |
| `←` / `→` | Vorige/volgende afbeelding |
| `?` | Sneltoetsen tonen |

> **Belangrijk:** Hoe nauwkeuriger je annoteert, hoe beter het model zal presteren. Zorg dat de bounding box strak om het logo zit.

---

### Stap 5: Model trainen

Nu je afbeeldingen hebt geüpload, gecategoriseerd en geannoteerd, kun je een model trainen.

1. Ga naar **Modellen** → klik op **Train New Model**, of ga direct naar de **Training Pipeline** pagina
2. Klik op **Nieuw Trainingsjob**
3. Configureer de training:

| Instelling | Standaard | Uitleg |
|------------|-----------|--------|
| **Naam** | — | Geef het model een herkenbare naam, bijv. "Logo v1.0" |
| **Categorieën** | — | Selecteer welke logo-categorieën je wilt trainen |
| **Epochs** | 100 | Aantal keer dat het model alle data doorloopt (meer = nauwkeuriger, maar langzamer) |
| **Batch Size** | 16 | Aantal afbeeldingen per trainingsstap |
| **Learning Rate** | 0.001 | Hoe snel het model leert (standaard is meestal goed) |
| **Data Augmentatie** | Middel | Hoeveel variaties van je afbeeldingen worden gemaakt |
| **Validatie Split** | 20% | Percentage data dat wordt gebruikt voor validatie |

4. Klik op **Start Training**
5. Volg de voortgang:
   - Voortgangsbalk toont het huidige epoch
   - Nauwkeurigheid (%) stijgt naarmate de training vordert
   - Loss (verlies) daalt naarmate het model verbetert
   - Geschatte resterende tijd wordt getoond

> **Tip:** Begin met de standaardinstellingen. Je kunt later experimenteren met hogere epochs of andere learning rates.

---

### Stap 6: Model activeren

Na de training moet je het model activeren voordat het gebruikt kan worden voor herkenning.

1. Ga naar **Modellen**
2. Je ziet een lijst met alle getrainde modellen
3. Bekijk de **nauwkeurigheid** — hoe hoger, hoe beter
4. Klik op **Activeren** bij het beste model
5. Bevestig de activatie

> **Tip:** Gebruik de **Vergelijken** functie om twee modellen naast elkaar te zetten en te zien welke beter presteert.

Je kunt modellen ook downloaden als `.onnx` bestand voor gebruik in andere systemen.

---

## Deel 2: Logo's herkennen

Nu je een getraind en geactiveerd model hebt, kun je logo's herkennen.

### Stap 1: Afbeelding uploaden

1. Ga naar **Herkennen** in de navigatiebalk
2. Sleep een afbeelding naar het uploadgebied, of klik om een bestand te selecteren
3. Ondersteunde formaten: **JPG, PNG, WebP** (max 10MB)

### Stap 2: Resultaten bekijken

Na het uploaden start de herkenning automatisch:

1. Een voortgangsbalk toont de verwerkingsstatus
2. Wanneer klaar, verschijnen de resultaten:
   - **Canvas** — De afbeelding met gekleurde rechthoeken rondom gedetecteerde logo's
   - **Resultatenlijst** — Elk gedetecteerd logo met:
     - Categorienaam (bijv. "Nike")
     - Betrouwbaarheidspercentage (bijv. 98.5%)
3. Klik op een resultaat in de lijst om het te markeren op de afbeelding

### Stap 3: Resultaten exporteren

1. Klik op de **Exporteren** knop
2. Kies het gewenste formaat:
   - **JSON** — voor integratie met andere systemen
   - **CSV** — voor spreadsheet-analyse
   - **XML** — voor enterprise-integratie
3. Het bestand wordt automatisch gedownload

---

## Verbindingsstatus

Rechtsonder in het scherm zie je de verbindingsstatus:

| Status | Betekenis |
|--------|-----------|
| **Connected** (groen) | Alles werkt, real-time updates actief |
| **API Online** (geel) | API werkt, maar real-time updates niet beschikbaar |
| **Backend Offline** (rood) | Server niet bereikbaar, herkenning niet mogelijk |

---

## Veelgestelde vragen

### Hoeveel afbeeldingen heb ik nodig per categorie?
Minimaal 10 geannoteerde afbeeldingen per categorie, maar 50+ levert betere resultaten.

### Hoe lang duurt training?
Afhankelijk van het aantal afbeeldingen en de instellingen. Voor 1000 afbeeldingen: circa 30 minuten.

### Kan ik het model verbeteren?
Ja! Upload meer afbeeldingen, annoteer ze, en train een nieuw model. Vergelijk het met het vorige model en activeer het als het beter presteert.

### Wat als de herkenning een logo mist?
Voeg meer trainingsafbeeldingen toe van dat specifieke logo, met name vanuit verschillende hoeken en belichting. Train vervolgens een nieuw model.

### Welke bestandsformaten worden ondersteund?
JPG, PNG en WebP. Maximaal 10MB per bestand.
