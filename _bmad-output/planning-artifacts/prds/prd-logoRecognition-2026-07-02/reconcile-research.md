# Input-reconciliatie — Research-rapport → PRD/Addendum

**Input:** `research/domain-referentie-vliegwiel-zonder-review-research-2026-07-02.md`
**Getoetst tegen:** `prd.md` + `addendum.md` (beide 2026-07-02)
**Datum reconciliatie:** 2026-07-02

Werkwijze: elk inzicht, elke aanbeveling en elk risico uit het rapport is nagelopen op aanwezigheid in PRD of addendum, met bijzondere aandacht voor (a) confirmation-bias-guardrails, (b) strategische synthesis-aanbevelingen, (c) risk-assessments, (d) kwalitatieve ideeën die buiten de FR-structuur zouden kunnen vallen.

---

## 1. Dekking — wat WEL geland is (verkort)

### (a) Guardrails/remedies tegen confirmation bias — volledig gedekt

| Remedie uit rapport (Patroon 2 + Recommendations) | Landing |
|---|---|
| Streng starten, verruimen na bewezen stabiliteit | FR-5 + assumption (drempel 0,90; verruiming na stabiele gold-set-historie) |
| Per-klasse caps + dedup (tweetraps: pHash + embedding) | FR-6, FR-7; technische invulling addendum §1 |
| Gold-set-regressie-gating per batch, automatische quarantaine | FR-3, FR-2; fail-closed in Cross-Cutting NFRs |
| Outlier-detectie als periodieke audit (incl. handmatige refs — RECYCLABLE-les) | FR-8 + consequence over handmatig gecureerde referenties |
| Onafhankelijke tweede stem (declaratie extern aan de lus) | Dubbele bevestiging (glossary + FR-1); nuance "promotie creëert wél een lus" verwerkt in Vision §1 en Risk-tabel rij 1 |
| Dynamische/adaptieve drempels (CW-BASS) | Bewust uitgesteld: MVP out-of-scope §6.2 + addendum §3 (verworpen alternatief, met literatuur-erkenning) — correcte, gedocumenteerde afweging |
| Nooit review-afgewezen materiaal herpromoveren (hard-negatives) | FR-9 |
| Vliegwiel pauzeert automatisch bij kwaliteitsdaling | FR-3 (batch-quarantaine) + FR-19 (automatische stilstand K=2) |

### (b) Strategische aanbevelingen uit de synthesis — 5/5 gedekt

1. Escalatiemodel (nooit rechtstreeks) → FR-1 t/m FR-4 + addendum §3 (verworpen alternatief "direct promoveren").
2. Begin streng, verruim op bewijs → FR-5-assumption. *Nuance: het rapport zegt "na N opeenvolgende stabiele gold-set-runs"; de PRD houdt het op "aantoonbaar stabiele historie" zonder N — acceptabel als bewuste vaagheid, maar N zou in de Assumptions Index kunnen (klein punt, geen gat).*
3. Gold-set laten meegroeien (elke reviewbeslissing = gratis kandidaat) → FR-10, FR-11, SM-4.
4. Mismatch-triggers als eersteklas product → FR-14 t/m FR-16 + addendum §5 (leverancier-terugkoppeling als vervolgproduct).
5. Backbone-spike (DINOv2) apart plannen → OQ-4 + addendum §5; Non-Goals expliciet.

### (c) Risk-assessments — grotendeels gedekt, met gaten (zie §2)

- Declaratie-fout (5–10% zelfrapportage) → PRD Risk-tabel rij 2 ✓ (incl. het "declaratie nooit als absolute waarheid"-principe: tweezijdige bevestiging).
- Klasse-onbalans (RECYCLABLE 8.643) → Risk-tabel rij 4 + FR-6 ✓.
- Gold-set te klein (91) → Risk-tabel rij 3 + FR-10/11 + OQ-1 ✓.
- Domain gap seed-bootstrap → FR-12 (zaad wordt nooit referentie) ✓.
- AI Act-herclassificatie → **GAT 1** (§2).
- ECGT-codelijst-churn → **GAT 2** (§2).
- Referentie-veroudering → **GAT 3** (gedeeltelijk; §2).

### (d) Kwalitatieve ideeën — gedekt

- Tesla-vertaling (shadow mode = 12.8-endpoint, triggers = mismatches, escalatie = poort) → Vision, §4.5, Why Now.
- Human-in-the-loop → human-over-the-loop (poortwachter-beheer i.p.v. per-sample) → Vision, §2.1, UJ-1.
- Weak-supervision-framing (declaratie als labeling function, drie signalen) → addendum §6.
- Commodity-hergebruik guardrail-tooling (FiftyOne/pHash) → addendum §1 (FR-8-rij) — *nuance: alleen bij FR-8 als optie genoemd; het rapport adviseert het breder ("niets van de guardrail-laag from scratch"). Klein punt voor de architect, geen PRD-gat.*
- Declaratie-prior als kandidaat-krimper (12.7) → Why Now (bestaand bouwsteen).
- Data-moat / "elke maand draaien vergroot de voorsprong" → Vision + Why Now (impliciet: "zonder vliegwiel verdampt de leerwaarde"). Voldoende voor een interne PRD.
- Rentmeesterschap zichtbaar (dashboard) → FR-17 t/m FR-19.
- ECGT-momentum als businesswaarde → Why Now + §2.1 (organisatie-JTBD) + addendum §5.
- Auditeerbaarheid als ontwerpprincipe → evidence-contract (glossary, FR-1) + NFR Herleidbaarheid.
- pHash-alleen-is-onvoldoende → addendum §1 expliciet.
- Mismatch-uitkomst "niet-ondersteund (geen actieve referentie)" als derde categorie → FR-14 consequence ✓.

---

## 2. Gaten — wat ontbreekt of onderbelicht is

### GAT 1 (belangrijkste) — AI Act: juridische toets + human-oversight-capability bij extern sturend gebruik

- **Wat ontbreekt:** het rapport classificeert het systeem als laag risico, maar waarschuwt expliciet: *"formele juridische toets aanbevolen zodra verdicts extern (n8n → klantprocessen) gaan sturen"* en de risk-tabel noemt als mitigatie *"logging/human-oversight-capability aanhouden"*. De PRD noemt de AI Act nergens; het addendum alleen als bron-tag in §6. Dit klemt omdat FR-20 de kruischeck-verdicts (die al extern via n8n lopen) juist structureel aan het vliegwiel koppelt en addendum §5 externe ontsluiting van het FR-16-rapport agendeert.
- **Waar in het rapport:** §Regulatory Requirements → Compliance Frameworks (AI Act-alinea) + Risk Assessment-tabel rij 3.
- **Waar het hoort in de PRD:** (1) rij in "Risk and Mitigations" — *AI Act-herclassificatie bij extern sturend gebruik van verdicts / Laag / Middel / juridische toets bij productisering; logging- en human-oversight-capability aanhouden (bestaat deels al: observability-NFR + pauzeknop FR-19)*; (2) eventueel als Open Question ("wanneer triggert productisering de juridische toets?"). Klein bijpunt: de komende geharmoniseerde CV-evaluatiestandaard (JT021025) valideert de gold-set-praktijk — één zin bij Why Now of addendum §6 volstaat.

### GAT 2 — ECGT-codelijst-churn: T3777-alias/deprecatie-mechanisme

- **Wat ontbreekt:** het rapport voorziet dat de ECGT bepaalde labels illegaal maakt en de T3777-codelijst daardoor gaat schuiven (codes gedepreceerd/vervangen), met als mitigatie een alias/deprecatie-mechanisme (basis aanwezig in 12.8 AC3). PRD en addendum zwijgen hierover, terwijl het vliegwiel per T3777-code caps, referenties, gold-set-records en mismatch-aggregaties opbouwt — codelijst-churn raakt al die structuren.
- **Waar in het rapport:** §Regulatory Requirements → Risk Assessment-tabel rij 4.
- **Waar het hoort in de PRD:** rij in "Risk and Mitigations" (*ECGT maakt labels illegaal → codelijst-churn / Middel / Laag / aansluiten op T3777-alias/deprecatie-mechanisme uit 12.8 AC3*) en een verwijzing in "Integration and Dependencies" (afhankelijkheid van het 12.8-aliasmechanisme).

### GAT 3 — Referentie-veroudering: ontbreekt in de risicotabel; rapport is directiever dan OQ-6

- **Wat ontbreekt:** het rapport benoemt tweemaal (Licensing-sectie én beide risk-tabellen) dat schema-eigenaren beeldmerken periodiek reviseren (EU-bio, Beter Leven gedocumenteerd) en dat de bibliotheek daarom **versie-/vervaldatum-beheer plus periodieke hermeting per referentie** nodig heeft. De PRD degradeert dit tot Open Question 6 ("is de outlier-audit afdoende of is actief versiebeheer nodig?") en laat het uit de risicotabel. De open vraag is legitiem, maar het *risico* zelf hoort in de risicotabel zodat het niet wegvalt richting epics.
- **Waar in het rapport:** §Regulatory → Licensing and Certification; §Regulatory Risk Assessment rij 2 ("Versiebeheer + variant-labels — bestaat al"); §Technical Trends → Challenges-tabel rij 4 ("Versie-/vervalbeheer + periodieke hermeting per referentie").
- **Waar het hoort in de PRD:** rij in "Risk and Mitigations" (*Keurmerk-beeldmerk gereviseerd → referenties verouderd / Middel / Middel / bestaande variant-labels + outlier-audit FR-8 als eerste signaal; actief versie-/vervalbeheer als open vraag OQ-6*). OQ-6 kan blijven staan als de vraag over de oplossingsvorm.

### GAT 4 — Synthetische context-expansie: de tweede rol van het schone logo is stilzwijgend gevallen

- **Wat ontbreekt:** het rapport geeft het schone vectorlogo twee rollen: (1) zoekzaad om echte crops te vinden — geland in FR-12 — en (2) *"grondstof voor synthetische overbrugging"*: het gedocumenteerde patroon "data expansion by synthesising context" (schoon logo op realistische achtergronden plakken met vervormingen) als brug voor klassen waar óók de bootstrap niets vindt. Rol (2) komt in PRD noch addendum voor. Dit is precies het type kwalitatief idee dat de FR-structuur laat vallen: het is geen requirement, maar wel het enige antwoord uit het rapport op de faalwijze "bootstrap-run vindt 0 ondubbelzinnige crops in declarerende GTINs" (lege klasse blijft leeg).
- **Waar in het rapport:** §Technical Trends → Innovation Patterns → Patroon 3 (synth-to-real), incl. bronnen 1612.09322 en YOLOv11 domain randomization.
- **Waar het hoort:** addendum §5 (Geagendeerde vervolgkansen) als terugvaloptie bij een falende bootstrap, met eventueel één zin in PRD §4.4 die erkent dat een bootstrap-run leeg kan uitvallen en wat er dan gebeurt (nu ongedefinieerd: blijft de klasse "gedraaid" maar leeg in de FR-13-wachtrij?).

### GAT 5 (klein) — Gebruiksrestrictie referentiebeelden (gids-logo's alleen intern)

- **Wat ontbreekt:** het rapport stelt als randvoorwaarde dat referentiebeelden uit de GS1 Label Guide en van schema-eigenaren *uitsluitend intern als visuele vergelijkingsbron* gebruikt worden (geen publicatie/hergebruik als merkuiting). Nu FR-16 een exporteerbaar rapport introduceert en addendum §5 externe ontsluiting agendeert, is één zin die deze restrictie vastlegt op zijn plaats.
- **Waar in het rapport:** §Regulatory → Licensing and Certification.
- **Waar het hoort:** één regel in PRD "Cross-Cutting NFRs" of bij Non-Goals; dan is de randvoorwaarde geborgd vóór de leverancier-terugkoppeling ooit extern gaat.

---

## 3. Conclusie

De PRD dekt de kern van het rapport uitstekend: alle confirmation-bias-guardrails, alle vijf synthesis-aanbevelingen en de technische faalwijze-lessen (RECYCLABLE, domain gap, klasse-onbalans, dunne gold-set) zijn traceerbaar geland, en de bewust-verworpen alternatieven zijn in het addendum gedocumenteerd. De gaten zitten geconcentreerd in de **regulatoire hoek** (AI Act-toets, ECGT-codelijst-churn, referentie-veroudering in de risicotabel) plus één stilgevallen kwalitatief idee (synthetische context-expansie als bootstrap-terugval). Alle vijf zijn met kleine, gerichte toevoegingen te dichten — geen ervan vergt nieuwe FR's.
