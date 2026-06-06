# ACC-database herstel — 2026-06-05

**Aanleiding:** ACC-database (`logo_recognition` op Cherry, 10.0.0.6) gerestored met backup van 2026-06-04; die bleek schema-only (Epic 7-niveau, 0 rijen behalve 1 user; `pg_stat_user_tables.n_tup_ins=0` bewees dat er nooit data is ingeladen). Epic 8-tabellen ontbraken (deploy-pad draaide geen migraties; `_prisma_migrations` bestond niet). MinIO-data op de Storage Box was al sinds april leeg — beelddata heeft nooit op ACC gestaan.

## Uitgevoerd (met akkoord gebruiker)

1. **Schema-reparatie** (additief, gegenereerd via `prisma migrate diff` live-DB → schema.prisma, toegepast via `prisma db execute` in de app-container):
   - `training_data`: +`active`, +`crop_path`, +`provenance`
   - Nieuw: `reference_embeddings` (vector(512)), `artwork_import_runs`, `artwork_imports`, `artwork_review_items`
   - 12 indexen + ivfflat cosine-index op `reference_embeddings` (handmatig toegevoegd; Prisma kan ivfflat niet uitdrukken)
   - Geverifieerd: 21/21 tabellen aanwezig
2. **Migratie-baseline**: `prisma migrate resolve --applied` voor 0001 t/m 0006 → `prisma migrate status` = "Database schema is up to date!"

## Openstaande punten

- [ ] **FK `reference_embeddings.reference_logo_id` → `reference_logos.id` ontbreekt**: `reference_logos` is eigendom van rol `postgres` (apart gerestored); de app-rol `logorecognition` mist REFERENCES-privilege. Cherry was via SSH onbereikbaar (timeout, ook via Vanilla-jump). Zodra bereikbaar, als superuser:
  ```sql
  ALTER TABLE reference_logos OWNER TO logorecognition;
  ALTER TABLE reference_embeddings ADD CONSTRAINT reference_embeddings_reference_logo_id_fkey
      FOREIGN KEY (reference_logo_id) REFERENCES reference_logos(id) ON DELETE CASCADE ON UPDATE CASCADE;
  ```
- [ ] **Migratiestrategie 0007/0008 (Epic 9) — open keuze gebruiker** (werkregel 2026-06-05: geen migratie-uitvoering zonder expliciete toestemming per geval): (a) handmatig per release na review + akkoord, of (b) eenmalig expliciet akkoord voor `migrate deploy` in container-startup. Voor te leggen bij de Epic 9 merge-voorbereiding.
- [ ] **Backup-bron verifiëren** op Cherry: waarom was de dump van 2026-06-04 schema-only? (actie gebruiker/beheer)
- [ ] **Data heropbouwen**: users/seeds, referentiebibliotheek (7.3), daarna trainingsdata via de Epic 8 artwork-importpipeline; model trainen via Epic 9
