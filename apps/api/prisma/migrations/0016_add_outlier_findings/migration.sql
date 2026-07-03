-- Story 14.3 — Wekelijkse outlier-audit op de referentiebibliotheek.
--
-- Eén wijziging uit de Structural Seed (AD-9): een nieuwe tabel
-- `outlier_findings`. De wekelijkse audit (`flywheel-outlier-audit`, queue
-- `flywheel`) meet elke ACTIEVE referentie tegen het klasse-centroid en markeert
-- referenties in het bovenste percentiel of boven de absolute afstandsgrens als
-- `open` melding — mét vergelijkingsdata (`distance`, `percentile`). De audit
-- deactiveert NIETS (FR-8): uitsluitend signalering + persistentie. De
-- beoordelingsacties (Behouden/Deactiveren → status `behouden`/`gedeactiveerd`,
-- `decided_by`/`decided_at`) verlopen via de dashboard-flow van Story 15.2 —
-- buiten deze story.
--
-- `audit_run_at` is het run-tijdstempel (NFR-5), één waarde per audit-run. De
-- FK naar `reference_logos` (ON DELETE CASCADE) ruimt findings mee op als een
-- referentie fysiek verdwijnt. De status-index dient de overview-query (open
-- findings); de created_at-DESC-index de recentheids-ordening.
--
-- Terugdraaipad: zie down.sql in deze map (drop tabel).

-- CreateTable
CREATE TABLE "outlier_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "audit_run_at" TIMESTAMPTZ NOT NULL,
    "reference_logo_id" UUID NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "percentile" DOUBLE PRECISION NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "decided_by" VARCHAR(255),
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outlier_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outlier_findings_status_idx" ON "outlier_findings"("status");

-- CreateIndex
CREATE INDEX "outlier_findings_created_at_idx" ON "outlier_findings"("created_at" DESC);

-- CreateIndex
CREATE INDEX "outlier_findings_reference_logo_id_idx" ON "outlier_findings"("reference_logo_id");

-- AddForeignKey
ALTER TABLE "outlier_findings" ADD CONSTRAINT "outlier_findings_reference_logo_id_fkey" FOREIGN KEY ("reference_logo_id") REFERENCES "reference_logos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
