## Uitslag per letter
### Alle methoden
| letter | gevonden | vals (aandeel foute meldingen) | eis |
|---|---|---|---|
| A | 85% (11/13) | 0% (0/11) | gehaald |
| B | 100% (11/11) | 62% (18/29) | niet gehaald |
| C | 53% (8/15) | 33% (4/12) | niet gehaald |
| D | 91% (29/32) | 9% (3/32) | gehaald |
| E | 91% (20/22) | 0% (0/20) | gehaald |

Zonder antwoord: 8. Matrix (waarheid -> gemeld): {"A": {"A": 11, "B": 3}, "B": {"B": 11, "C": 1}, "C": {"B": 10, "C": 8}, "D": {"D": 29, "C": 3, "B": 4}, "E": {"E": 20, "D": 3, "B": 1}}
### Alleen nutriscore-a2/nutriscore-head
| letter | gevonden | vals (aandeel foute meldingen) | eis |
|---|---|---|---|
| A | 0% (0/13) | n.v.t. | niet gehaald |
| B | 0% (0/11) | n.v.t. | niet gehaald |
| C | 0% (0/15) | n.v.t. | niet gehaald |
| D | 0% (0/32) | n.v.t. | niet gehaald |
| E | 0% (0/22) | n.v.t. | niet gehaald |

Zonder antwoord: 8. Matrix (waarheid -> gemeld): {"A": {"geen": 13}, "B": {"geen": 11}, "C": {"geen": 15}, "D": {"geen": 32}, "E": {"geen": 22}}
### Alleen embedding
| letter | gevonden | vals (aandeel foute meldingen) | eis |
|---|---|---|---|
| A | 0% (0/13) | n.v.t. | niet gehaald |
| B | 0% (0/11) | n.v.t. | niet gehaald |
| C | 0% (0/15) | n.v.t. | niet gehaald |
| D | 0% (0/32) | n.v.t. | niet gehaald |
| E | 0% (0/22) | n.v.t. | niet gehaald |

Zonder antwoord: 8. Matrix (waarheid -> gemeld): {"A": {"geen": 13}, "B": {"geen": 11}, "C": {"geen": 15}, "D": {"geen": 32}, "E": {"geen": 22}}
## Origineel en herschaald (alle methoden)
### Origineel (41 etiketten)
| letter | gevonden | vals (aandeel foute meldingen) | eis |
|---|---|---|---|
| A | 67% (4/6) | 0% (0/4) | niet gehaald |
| B | 100% (2/2) | 60% (3/5) | niet gehaald |
| C | n.v.t. | 100% (1/1) | niet gehaald |
| D | 100% (3/3) | 0% (0/3) | gehaald |
| E | 100% (9/9) | 0% (0/9) | gehaald |

Zonder antwoord: 6. Matrix (waarheid -> gemeld): {"A": {"A": 4, "B": 2}, "B": {"B": 2, "C": 1}, "C": {}, "D": {"D": 3, "B": 1}, "E": {"E": 9}}
### Herschaald (78 etiketten)
| letter | gevonden | vals (aandeel foute meldingen) | eis |
|---|---|---|---|
| A | 100% (7/7) | 0% (0/7) | gehaald |
| B | 100% (9/9) | 62% (15/24) | niet gehaald |
| C | 53% (8/15) | 27% (3/11) | niet gehaald |
| D | 90% (26/29) | 10% (3/29) | niet gehaald |
| E | 85% (11/13) | 0% (0/11) | gehaald |

Zonder antwoord: 2. Matrix (waarheid -> gemeld): {"A": {"A": 7, "B": 1}, "B": {"B": 9}, "C": {"B": 10, "C": 8}, "D": {"D": 26, "C": 3, "B": 3}, "E": {"D": 3, "E": 11, "B": 1}}
## Herkomst van de Nutri-Score-detecties
- k4aa: 182
## Modelversies (antwoorden)
- acc-20261006/k4aa: 111
## Referentieversies (basis, antwoorden)
- 540:2026-08-26T06:14:43.350Z: 111
> Voorbehoud: de scores gebruiken de ruwe `detections` (ook onder drempel en bij twijfel), niet de `items` met `uitkomststand` die afnemers zien.
> Voorbehoud: een gewichtswijziging in MinIO is in modelversie en referentieversie niet zichtbaar.
> Voorbehoud: de referentiebeelden van de oude route kunnen uit dezelfde etiketten komen. Trainingsoverlap is niet gemeten; de scores kunnen daardoor te gunstig zijn.
e gunstig zijn.
