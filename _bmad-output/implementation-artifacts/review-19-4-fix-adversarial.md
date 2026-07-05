# Adversarial review — Story 19.4 FIX (gebalanceerde sampler → crop-producerend pad)

- reviewed_commit: (epic-19-fix-194 HEAD — zie commit onderaan)
- scope: `apps/api/src/services/flywheel/balanced-sampler.ts`,
  `apps/api/src/services/flywheel/bootstrap-run.ts`,
  `apps/api/src/__tests__/services/flywheel-balanced-sampler.test.ts`
- verdict: **PASS**

## Het defect (bevestigd + gereproduceerd)

De vlag-AAN-tak van `balanced-sampler.ts` bood elk geselecteerd etiket-label aan
`nominateCandidate({ detection: { cropPath: sel.label, sourceFile: sel.label, confidence: 1 } })`
aan — dus het HELE etiketbestand (previewUrl van de verpakking, bv. een PDF) als
"crop". `nominateCandidate` berekent phash+embedding RECHTSTREEKS uit die crop en
LOKALISEERT NIET. Een referentie-logo moet een uitgesneden keurmerk-regio zijn →
hele-verpakking-nominatie is semantisch fout (vervuilt `reference_candidates`) of
een no-op (PDF-previewUrl onverwerkbaar). De sampler miste de localisatie-stap.

## De fix

1. `bootstrap-run.ts`: de crop-producerende kern van `processClass` is geëxtraheerd
   als exporteerbare `searchAndNominateClass(t3777Code, candidateGtins, { remainingBudget,
   deadline, origin })`. Die doet: `resolveSeedPath` (zaad) → per GTIN de HARDE
   `resolveDeclarations`-guard + `resolveArtworkPage` → `mlClient.bootstrapSearch`
   (ECHTE crops met `seed_cosine`) → `nominateCandidate` met het ECHTE `crop_path`.
   `processClass` wikkelt er de `bootstrap_queue`-statusovergangen omheen — gedrag
   ongewijzigd (18/18 bootstrap-tests groen).
2. `balanced-sampler.ts`: de vlag-AAN-tak leidt per klasse de gebalanceerde,
   distincte GTINs af (`distinctGtins`, selectievolgorde behouden = spreiding) en
   roept `searchAndNominateClass` aan. Klassen zonder zaad worden overgeslagen +
   geteld (`classesSkippedNoSeed`), net als in de bootstrap-run. Het rauwe label
   gaat NOOIT meer als crop de poort in.

## Bevindingen (critical → low)

- **critical** — geen. Het defect zelf is de fix.
- **high** — geen. Geen directe referentie-write; MLClient-only; herkomst `bootstrap`;
  vlag-gating (AD-8) intact (vlag-uit/dry-run = geen writes, geen ml-search).
- **medium** — geen. Circulaire import gecheckt: sampler → bootstrap-run → config;
  bootstrap-run importeert niets uit sampler → geen cyclus. `confidence` is nu de
  ECHTE `seed_cosine` (≥ 0,93 bootstrap-drempel), niet langer een kunstmatige 1;
  passeert de embedding-promotiedrempel (0,90) op merites.
- **low** — budget: elke klasse krijgt in de sampler het volle `getBootstrapRunBudget()`
  (200); de sampler-cap N (default 50) begrenst de distincte GTINs al bovenstrooms,
  dus < budget — geen drift. `deadline` wordt per klasse vers berekend (de sampler
  is geen job met één gedeelde time-box); acceptabel, want de sampler draait niet
  live (geen self-runner). Genoteerd, geen actie.

## Test-gat (waarom de vorige mock het miste) — GEDICHT

De oude test mockte `nominateCandidate` én verifieerde `detection: { cropPath: 'a1' }` —
exact het rauwe label. Die assert BEVROOR het foute gedrag: de mock slikte het label
als crop en de test keurde het goed. De nieuwe suite mockt `nominateCandidate` niet
om het label te billijken, maar laat `searchAndNominateClass` echt lopen (gemockte
`mlClient.bootstrapSearch` + `resolveDeclarations` + prisma) en bewijst:
- `mlClient.bootstrapSearch` WORDT aangeroepen met de gebalanceerde GTIN-set (het oude
  gedrag riep het NOOIT aan → test faalt op oud gedrag);
- `nominateCandidate` wordt UITSLUITEND met een ECHT `crop_path` (`artwork-crops/...`)
  aangeroepen, NOOIT met het label of het zaad (het oude gedrag gaf `cropPath: 'a1'` →
  test faalt op oud gedrag);
- klasse zonder zaad → geen ml-search, geen nominatie, `classesSkippedNoSeed` geteld.
De balans-/cap-/vlag-uit-tests zijn behouden.

## Gates

- `npx tsc --noEmit` → exit 0.
- Volledige api-suite: 855 passed | 2 skipped | 37 todo (0 failed).
- Sampler-suite: 15/15 groen; bootstrap-suite: 18/18 groen (refactor-regressievrij).

## AC-trace (19.4)

- AC1 (per keurmerk N gebalanceerd, via bestaand poort-pad, ECHTE crops, nooit direct
  in reference_logos): `runBalancedSampler` vlag-AAN → `searchAndNominateClass` →
  `nominateCandidate` met echt crop_path. Tests: "roept mlClient.bootstrapSearch aan
  met de gebalanceerde GTINs", "nomineert UITSLUITEND ECHTE crop_paths", "respecteert
  de declaratie-guard", "klasse zonder zaad overgeslagen".
- AC2 (cap bij N + overschot mét reden, NFR-5): `selectBalanced`/`buildSelectionPlan`.
  Tests: "capt bij N en telt het overschot", "rapporteert het totale overschot over
  klassen", "poort-uitkomsten worden geteld".
- AC3 (achter de nominatie-vlag, default uit): Tests: "vlag UIT → geen nominatie/
  write, geen ml-search", "expliciete dry-run → geen writes".

Alle 3 AC's gedekt door een falende-op-oud-gedrag geautomatiseerde test. **PASS.**
