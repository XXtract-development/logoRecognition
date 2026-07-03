"""
Database service for ML Service.
Handles PostgreSQL connection and queries for training jobs, models, and embeddings.
"""

import json
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import asyncpg
import numpy as np

from app.core.config import settings
from app.core.logging import logger


def _parse_pgvector(value: Any) -> np.ndarray:
    """Parse a pgvector text representation ("[0.1,0.2,...]") into a numpy array.

    pgvector returns its value as a bracketed, comma-separated string when cast
    to ::text. asyncpg has no native codec for the vector type, so we parse it
    here. Returns an empty float32 array on malformed input.
    """
    if isinstance(value, np.ndarray):
        return value.astype(np.float32)
    if value is None:
        return np.array([], dtype=np.float32)
    if isinstance(value, (list, tuple)):
        return np.array(value, dtype=np.float32)
    text = str(value).strip()
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1]
    if not text:
        return np.array([], dtype=np.float32)
    try:
        return np.array([float(x) for x in text.split(",")], dtype=np.float32)
    except ValueError:
        return np.array([], dtype=np.float32)


class DatabaseService:
    """PostgreSQL database service for ML operations."""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self._connected = False

    async def connect(self) -> None:
        """Create database connection pool."""
        if self.pool:
            return

        try:
            self.pool = await asyncpg.create_pool(
                settings.DATABASE_URL,
                min_size=2,
                max_size=10,
                command_timeout=60,
            )
            self._connected = True
            logger.info("Database connection pool created")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            self._connected = False
            raise

    async def disconnect(self) -> None:
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()
            self.pool = None
            self._connected = False
            logger.info("Database connection pool closed")

    @property
    def is_connected(self) -> bool:
        return self._connected and self.pool is not None

    @asynccontextmanager
    async def get_connection(self):
        """Get a database connection from pool."""
        if not self.pool:
            await self.connect()
        async with self.pool.acquire() as conn:
            yield conn

    # ============================================
    # Training Batch Operations
    # ============================================

    async def create_training_job(
        self,
        job_id: str,
        batch_id: str,
        user_id: Optional[str] = None,
        config: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Create a new training job record."""
        async with self.get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO training_batches (id, name, status, user_id, created_at, updated_at)
                VALUES ($1, $2, 'TRAINING', $3, NOW(), NOW())
                RETURNING id, name, status, created_at
                """,
                job_id,
                f"Training job for batch {batch_id}",
                user_id or "00000000-0000-0000-0000-000000000000",
            )
            return dict(row) if row else {}

    async def update_training_job(
        self,
        job_id: str,
        status: str,
        progress: float = 0,
        current_epoch: Optional[int] = None,
        current_accuracy: Optional[float] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """Update training job progress."""
        async with self.get_connection() as conn:
            await conn.execute(
                """
                UPDATE training_batches
                SET status = $2, updated_at = NOW()
                WHERE id = $1
                """,
                job_id,
                status,
            )

    async def get_training_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get training job by ID."""
        async with self.get_connection() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM training_batches WHERE id = $1", job_id
            )
            return dict(row) if row else None

    async def list_training_jobs(
        self,
        status: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """List training jobs."""
        async with self.get_connection() as conn:
            if status:
                rows = await conn.fetch(
                    """
                    SELECT * FROM training_batches
                    WHERE status = $1
                    ORDER BY created_at DESC
                    LIMIT $2
                    """,
                    status,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM training_batches
                    ORDER BY created_at DESC
                    LIMIT $1
                    """,
                    limit,
                )
            return [dict(row) for row in rows]

    # ============================================
    # Model Version Operations
    # ============================================

    async def create_model_version(
        self,
        version: str,
        model_type: str,
        accuracy: Optional[float] = None,
        precision_score: Optional[float] = None,
        recall_score: Optional[float] = None,
        f1_score: Optional[float] = None,
        config: Optional[Dict] = None,
        metrics: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Create a new model version record.

        ``metrics`` (Story 7.2) carries the holdout-evaluation block, kept
        distinct from the scalar train/val metric columns. Both ``config`` and
        ``metrics`` are serialised with ``json.dumps`` so they round-trip as
        JSONB — Python's ``str()`` repr (single quotes) is not valid JSON and
        would be rejected by the JSONB column.
        """
        async with self.get_connection() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO model_versions
                (version, model_type, accuracy, precision_score, recall_score, f1_score,
                 training_date, is_active, config, metrics, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), false, $7, $8, NOW())
                RETURNING id, version, model_type, accuracy, is_active, created_at
                """,
                version,
                model_type,
                accuracy,
                precision_score,
                recall_score,
                f1_score,
                json.dumps(config or {}),
                json.dumps(metrics or {}),
            )
            return dict(row) if row else {}

    async def get_active_model(self) -> Optional[Dict[str, Any]]:
        """Get the currently active model."""
        async with self.get_connection() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM model_versions WHERE is_active = true LIMIT 1"
            )
            return dict(row) if row else None

    async def activate_model(self, model_id: str) -> None:
        """Activate a model version (deactivates others)."""
        async with self.get_connection() as conn:
            async with conn.transaction():
                # Deactivate all models
                await conn.execute("UPDATE model_versions SET is_active = false")
                # Activate the specified model
                await conn.execute(
                    "UPDATE model_versions SET is_active = true WHERE id = $1", model_id
                )

    async def list_models(self, limit: int = 20) -> List[Dict[str, Any]]:
        """List all model versions."""
        async with self.get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM model_versions
                ORDER BY created_at DESC
                LIMIT $1
                """,
                limit,
            )
            return [dict(row) for row in rows]

    # ============================================
    # Logo Operations
    # ============================================

    async def get_or_create_logo(
        self,
        category: str,
        value: str,
    ) -> Dict[str, Any]:
        """Get or create a logo entry."""
        async with self.get_connection() as conn:
            # Try to get existing
            row = await conn.fetchrow(
                "SELECT * FROM logos WHERE category = $1 AND value = $2",
                category,
                value,
            )
            if row:
                return dict(row)

            # Create new
            row = await conn.fetchrow(
                """
                INSERT INTO logos (category, value, confidence_threshold, training_samples, is_active, created_at, updated_at)
                VALUES ($1, $2, 0.99, 0, true, NOW(), NOW())
                RETURNING *
                """,
                category,
                value,
            )
            return dict(row) if row else {}

    async def update_logo_training_stats(
        self,
        logo_id: str,
        training_samples: int,
        accuracy: Optional[float] = None,
    ) -> None:
        """Update logo training statistics."""
        async with self.get_connection() as conn:
            await conn.execute(
                """
                UPDATE logos
                SET training_samples = $2, accuracy = $3, updated_at = NOW()
                WHERE id = $1
                """,
                logo_id,
                training_samples,
                accuracy,
            )

    async def get_all_logos(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get all logos."""
        async with self.get_connection() as conn:
            if active_only:
                rows = await conn.fetch(
                    "SELECT * FROM logos WHERE is_active = true ORDER BY category, value"
                )
            else:
                rows = await conn.fetch("SELECT * FROM logos ORDER BY category, value")
            return [dict(row) for row in rows]

    async def get_logo_training_progress(self) -> List[Dict[str, Any]]:
        """Get training progress for all logos."""
        async with self.get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    id, category, value,
                    training_samples, accuracy, confidence_threshold,
                    CASE
                        WHEN accuracy >= confidence_threshold THEN 'complete'
                        WHEN training_samples > 0 THEN 'in_progress'
                        ELSE 'not_started'
                    END as training_status
                FROM logos
                WHERE is_active = true
                ORDER BY category, value
                """
            )
            return [dict(row) for row in rows]

    # ============================================
    # Embedding Operations
    # ============================================

    async def store_embedding(
        self,
        logo_id: str,
        model_id: str,
        embedding: np.ndarray,
    ) -> str:
        """Store a logo embedding."""
        async with self.get_connection() as conn:
            # Convert numpy array to list for pgvector
            embedding_list = embedding.tolist()
            row = await conn.fetchrow(
                """
                INSERT INTO logo_embeddings (logo_id, model_id, embedding, created_at)
                VALUES ($1, $2, $3, NOW())
                RETURNING id
                """,
                logo_id,
                model_id,
                str(embedding_list),
            )
            return str(row["id"]) if row else ""

    async def find_similar_logos(
        self,
        embedding: np.ndarray,
        limit: int = 5,
        threshold: float = 0.8,
    ) -> List[Dict[str, Any]]:
        """Find similar logos using vector similarity search."""
        async with self.get_connection() as conn:
            embedding_list = embedding.tolist()
            rows = await conn.fetch(
                """
                SELECT
                    le.id as embedding_id,
                    l.id as logo_id,
                    l.category,
                    l.value,
                    l.confidence_threshold,
                    1 - (le.embedding <=> $1::vector) as similarity
                FROM logo_embeddings le
                JOIN logos l ON le.logo_id = l.id
                WHERE l.is_active = true
                ORDER BY le.embedding <=> $1::vector
                LIMIT $2
                """,
                str(embedding_list),
                limit,
            )
            return [dict(row) for row in rows if row.get("similarity", 0) >= threshold]

    # ============================================
    # Reference Embedding Operations (Epic 8, Story 8.4)
    # ============================================
    #
    # Reference embeddings live in their OWN table `reference_embeddings`,
    # deliberately NOT in `logo_embeddings`:
    #   (a) logo_embeddings.model_id is NOT NULL, but reference embeddings are
    #       model-independent (they describe official keurmerk artwork, not a
    #       trained model's view of it);
    #   (b) sharing the table would pollute find_similar_logos — reference
    #       artwork would surface as logo search results.
    # The pgvector query pattern below mirrors find_similar_logos exactly.

    async def store_reference_embedding(
        self,
        reference_logo_id: str,
        embedding: np.ndarray,
    ) -> str:
        """Store an embedding for a reference keurmerk variant."""
        async with self.get_connection() as conn:
            embedding_list = embedding.tolist()
            row = await conn.fetchrow(
                """
                INSERT INTO reference_embeddings (reference_logo_id, embedding, created_at)
                VALUES ($1, $2, NOW())
                RETURNING id
                """,
                reference_logo_id,
                str(embedding_list),
            )
            return str(row["id"]) if row else ""

    async def clear_reference_embeddings(self) -> int:
        """Delete all reference embeddings (used before a full rebuild)."""
        async with self.get_connection() as conn:
            result = await conn.execute("DELETE FROM reference_embeddings")
            # asyncpg returns e.g. "DELETE 12"
            try:
                return int(result.split()[-1])
            except (ValueError, IndexError):
                return 0

    async def reindex_reference_embeddings(self) -> None:
        """REINDEX the ivfflat index on reference_embeddings (Story 8-N1).

        Runtime maintenance, NOT a schema migration. An ivfflat index built on
        an empty table has degenerate clusters: index scans then silently
        return 0 rows. Because ``rebuild_reference_embeddings`` clears the
        table before refilling it, the index must be rebuilt afterwards.

        The index name is resolved dynamically from pg_indexes — migration
        renumbering may rename it, so it is never hardcoded. Raises on REINDEX
        failure (the caller counts it as a non-fatal error).
        """
        async with self.get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT indexname
                FROM pg_indexes
                WHERE tablename = 'reference_embeddings'
                  AND indexdef ILIKE '%ivfflat%'
                LIMIT 1
                """
            )
            if row is None:
                logger.warning(
                    "No ivfflat index found on reference_embeddings — REINDEX skipped"
                )
                return
            index_name = row["indexname"]
            # Identifier comes from pg_indexes (not user input); quote defensively.
            await conn.execute(f'REINDEX INDEX "{index_name}"')
            logger.info(
                f"REINDEX complete for reference_embeddings index '{index_name}'"
            )

    async def get_reference_embeddings(self) -> List[Dict[str, Any]]:
        """Return all reference embeddings joined with their keurmerk metadata.

        Each row: {reference_logo_id, t3777_code, variant_label, embedding}
        where ``embedding`` is parsed back into a numpy float32 array. Only
        embeddings of ACTIVE reference variants are returned — soft-deleted
        variants must not influence classification. No holdout filtering applies
        here: reference embeddings are independent of the training/holdout split.

        Diagnostics/introspection helper (Story 8.4): the production classify
        path uses pgvector via ``find_similar_references`` (no Python-side vector
        search). This full-dump accessor exists for index inspection, rebuild
        verification and tests — NOT for per-crop similarity in the hot path.
        """
        async with self.get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    re.reference_logo_id,
                    rl.t3777_code,
                    rl.variant_label,
                    re.embedding::text AS embedding_text
                FROM reference_embeddings re
                JOIN reference_logos rl ON re.reference_logo_id = rl.id
                WHERE rl.active = true
                """
            )
            results: List[Dict[str, Any]] = []
            for row in rows:
                results.append(
                    {
                        "reference_logo_id": str(row["reference_logo_id"]),
                        "t3777_code": row["t3777_code"],
                        "variant_label": row["variant_label"],
                        "embedding": _parse_pgvector(row["embedding_text"]),
                    }
                )
            return results

    async def get_reference_embeddings_for_class(
        self, t3777_code: str
    ) -> List[np.ndarray]:
        """Return the ACTIVE reference embedding vectors for one keurmerk class.

        Read-only helper for the per-batch outlier-audit (Story 13.4, AD-9): the
        class-centroid is computed from the active reference embeddings of the
        candidate's class. Malformed/empty vectors are skipped so a corrupt row
        never poisons the centroid. Returns an empty list when the class has no
        active reference embeddings (leeg-klasse-randgeval — the caller defines
        the answer, no crash).
        """
        async with self.get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT re.embedding::text AS embedding_text
                FROM reference_embeddings re
                JOIN reference_logos rl ON re.reference_logo_id = rl.id
                WHERE rl.active = true AND rl.t3777_code = $1
                """,
                t3777_code,
            )
            vectors: List[np.ndarray] = []
            for row in rows:
                vec = _parse_pgvector(row["embedding_text"])
                if vec.size > 0:
                    vectors.append(vec)
            return vectors

    async def get_active_reference_embeddings_with_ids_for_class(
        self, t3777_code: str
    ) -> List[Dict[str, Any]]:
        """Return the ACTIVE reference embeddings of one class WITH their ids.

        Read-only helper for the library-wide outlier audit (Story 14.3, AD-9):
        the weekly audit needs, per active reference of the class, both the
        embedding vector (to measure distance to the class centroid) and the
        ``reference_logo_id`` (so the API can persist a finding tied to that
        reference). Unlike ``get_reference_embeddings_for_class`` (13.4, vectors
        only), this returns id + vector.

        Covers ALL active references regardless of ``source`` — so manually
        curated references (``source`` != flywheel-promotion) are audited too
        (FR-8, the RECYCLABLE incident). Malformed/empty vectors are skipped so a
        corrupt row never poisons the centroid. Returns an empty list when the
        class has no active reference embeddings (leeg-klasse-randgeval).
        """
        async with self.get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT re.reference_logo_id, re.embedding::text AS embedding_text
                FROM reference_embeddings re
                JOIN reference_logos rl ON re.reference_logo_id = rl.id
                WHERE rl.active = true AND rl.t3777_code = $1
                """,
                t3777_code,
            )
            results: List[Dict[str, Any]] = []
            for row in rows:
                vec = _parse_pgvector(row["embedding_text"])
                if vec.size == 0:
                    continue
                results.append(
                    {
                        "reference_logo_id": str(row["reference_logo_id"]),
                        "embedding": vec,
                    }
                )
            return results

    async def get_active_reference_entries(self) -> List[Dict[str, Any]]:
        """Return ALL active reference embeddings for the regression-eval (Story 13.5).

        Read-only accessor for the gold-set regression gate (AD-5): each row
        carries the embedding vector, the class (``t3777_code``) and the crop
        location (``storage_path`` → ``cropPath``) so the self-match-guard can
        exclude a reference that is the same crop as a gold-set query (AD-5,
        leave-one-out). Reference logos carry no stored content-hash, so the guard
        falls back on ``cropPath`` equality for these rows.

        Only ACTIVE reference variants are returned — soft-deleted variants must
        not influence the measurement. Malformed/empty vectors are skipped so a
        corrupt row never poisons the eval.
        """
        async with self.get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    re.reference_logo_id,
                    rl.t3777_code,
                    rl.storage_path,
                    re.embedding::text AS embedding_text
                FROM reference_embeddings re
                JOIN reference_logos rl ON re.reference_logo_id = rl.id
                WHERE rl.active = true
                """
            )
            results: List[Dict[str, Any]] = []
            for row in rows:
                vec = _parse_pgvector(row["embedding_text"])
                if vec.size == 0:
                    continue
                results.append(
                    {
                        "reference_logo_id": str(row["reference_logo_id"]),
                        "t3777_code": row["t3777_code"],
                        "storage_path": row["storage_path"],
                        "embedding": vec,
                    }
                )
            return results

    async def find_similar_references(
        self,
        embedding: np.ndarray,
        limit: int = 5,
        threshold: float = 0.75,
    ) -> List[Dict[str, Any]]:
        """Find the closest reference keurmerk variants via pgvector cosine.

        Mirrors find_similar_logos (Epic 8 Dev Notes: reuse the existing
        pgvector search, do NOT build a separate vector search in Python).
        ``similarity`` = 1 - cosine_distance, clamped into [0, 1]. Only active
        reference variants are searched; results are filtered by ``threshold``.
        """
        async with self.get_connection() as conn:
            embedding_list = embedding.tolist()
            rows = await conn.fetch(
                """
                SELECT
                    rl.id AS reference_logo_id,
                    rl.t3777_code,
                    rl.variant_label,
                    1 - (re.embedding <=> $1::vector) AS similarity
                FROM reference_embeddings re
                JOIN reference_logos rl ON re.reference_logo_id = rl.id
                WHERE rl.active = true
                ORDER BY re.embedding <=> $1::vector
                LIMIT $2
                """,
                str(embedding_list),
                limit,
            )
            out: List[Dict[str, Any]] = []
            for row in rows:
                sim = float(row.get("similarity", 0.0) or 0.0)
                sim = max(0.0, min(1.0, sim))  # cosine distance can exceed [0,2]
                if sim >= threshold:
                    out.append(
                        {
                            "reference_logo_id": str(row["reference_logo_id"]),
                            "t3777_code": row["t3777_code"],
                            "variant_label": row["variant_label"],
                            "similarity": sim,
                        }
                    )
            return out

    async def get_active_reference_logos(self) -> List[Dict[str, Any]]:
        """Return all active reference keurmerk variants (one row per variant)."""
        async with self.get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT id, t3777_code, variant_label, storage_path
                FROM reference_logos
                WHERE active = true
                ORDER BY t3777_code, variant_label
                """
            )
            return [dict(row) for row in rows]

    # ============================================
    # Training Data Operations
    # ============================================

    async def _execute_query(self, query: str, *args) -> List[Dict[str, Any]]:
        """Execute a read query and return rows as dicts.

        Centralises the fetch path so training/holdout selection always runs
        through a single, testable entry point (Epic 7, NFR3).
        """
        async with self.get_connection() as conn:
            rows = await conn.fetch(query, *args)
            return [dict(row) for row in rows]

    async def get_training_images(
        self,
        batch_id: Optional[str] = None,
        validated_only: bool = True,
        include_holdout: bool = False,
    ) -> List[Dict[str, Any]]:
        """Get training images with their labels.

        Holdout-marked records are excluded at QUERY level (NFR3) by default:
        they must never reach the training selection, not even before Python
        filtering. Non-training consumers (e.g. embedding rebuilds in the
        similarity service) pass ``include_holdout=True`` because excluding
        the holdout set there would silently drop logos from the vector index.
        """
        holdout_clause = "" if include_holdout else "AND td.holdout = false"
        holdout_clause_left = "" if include_holdout else "WHERE td.holdout IS NOT TRUE"
        if validated_only:
            # active=false records are deactivated bad sources (Epic 8, Story 8.6)
            # and must never reach the training selection. Applied at the inner
            # JOIN where td.active is guaranteed non-null.
            query = f"""
                SELECT
                    li.id, li.filename, li.storage_path, li.brand_name,
                    td.label, td.confidence
                FROM logo_images li
                JOIN training_data td ON td.image_id = li.id
                WHERE td.validated = true
                  AND td.active = true
                  {holdout_clause}
                ORDER BY li.created_at DESC
            """
        else:
            # LEFT JOIN: keep images without any training_data row (td.active NULL);
            # only exclude rows that are explicitly deactivated (Epic 8, Story 8.6).
            active_clause_left = "AND (td.active = true OR td.id IS NULL)"
            base_where = holdout_clause_left or "WHERE 1=1"
            query = f"""
                SELECT
                    li.id, li.filename, li.storage_path, li.brand_name,
                    td.label, td.confidence
                FROM logo_images li
                LEFT JOIN training_data td ON td.image_id = li.id
                {base_where}
                  {active_clause_left}
                ORDER BY li.created_at DESC
            """
        return await self._execute_query(query)

    async def get_holdout_images(self) -> List[Dict[str, Any]]:
        """Return ONLY the protected holdout records (validated holdout set).

        Used for the fixed-set evaluation in Story 7.2. Selects td.holdout so
        every returned dict carries holdout=True.
        """
        query = """
            SELECT
                li.id, li.filename, li.storage_path, li.brand_name,
                td.label, td.confidence, td.holdout
            FROM logo_images li
            JOIN training_data td ON td.image_id = li.id
            WHERE td.validated = true
              AND td.holdout = true
              AND td.active = true
            ORDER BY li.created_at DESC
        """
        return await self._execute_query(query)

    async def count_holdout_images(self) -> int:
        """Count the validated holdout records (NFR3 minimum-size guard)."""
        async with self.get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) AS count
                FROM training_data
                WHERE validated = true AND holdout = true
                """
            )
            return int(row["count"]) if row else 0

    # ============================================
    # Story 8.7 — Synthetic data support
    # ============================================

    async def get_class_counts(self, active_only: bool = True) -> Dict[str, int]:
        """
        Return the number of validated, non-holdout training samples per class label.

        Used by the synthetic data generator (Story 8.7) to decide which classes
        need supplementation.  Holdout samples are intentionally excluded because
        the holdout set must remain 100% real (NFR3).

        Args:
            active_only: When True (default), count only active=true records.

        Returns:
            { label: count }  — only classes with at least one qualifying sample.
        """
        active_clause = "AND td.active = true" if active_only else ""
        query = f"""
            SELECT td.label, COUNT(*) AS cnt
            FROM training_data td
            WHERE td.validated = true
              AND td.holdout = false
              {active_clause}
            GROUP BY td.label
        """
        rows = await self._execute_query(query)
        return {row["label"]: int(row["cnt"]) for row in rows}

    # ============================================
    # Health Check
    # ============================================

    async def health_check(self) -> Dict[str, Any]:
        """Check database health."""
        try:
            async with self.get_connection() as conn:
                result = await conn.fetchval("SELECT 1")
                return {
                    "status": "healthy" if result == 1 else "degraded",
                    "connected": True,
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "connected": False,
                "error": str(e),
            }


# Global database service instance
db_service = DatabaseService()
