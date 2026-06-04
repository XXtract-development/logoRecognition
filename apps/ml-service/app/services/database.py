"""
Database service for ML Service.
Handles PostgreSQL connection and queries for training jobs, models, and embeddings.
"""

import os
import json
from typing import Optional, List, Dict, Any
from datetime import datetime
import asyncpg
import numpy as np
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.logging import logger


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
                job_id, f"Training job for batch {batch_id}",
                user_id or "00000000-0000-0000-0000-000000000000"
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
                job_id, status
            )

    async def get_training_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get training job by ID."""
        async with self.get_connection() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM training_batches WHERE id = $1",
                job_id
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
                    status, limit
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM training_batches
                    ORDER BY created_at DESC
                    LIMIT $1
                    """,
                    limit
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
                version, model_type, accuracy, precision_score, recall_score, f1_score,
                json.dumps(config or {}), json.dumps(metrics or {})
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
                await conn.execute(
                    "UPDATE model_versions SET is_active = false"
                )
                # Activate the specified model
                await conn.execute(
                    "UPDATE model_versions SET is_active = true WHERE id = $1",
                    model_id
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
                limit
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
                category, value
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
                category, value
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
                logo_id, training_samples, accuracy
            )

    async def get_all_logos(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """Get all logos."""
        async with self.get_connection() as conn:
            if active_only:
                rows = await conn.fetch(
                    "SELECT * FROM logos WHERE is_active = true ORDER BY category, value"
                )
            else:
                rows = await conn.fetch(
                    "SELECT * FROM logos ORDER BY category, value"
                )
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
                logo_id, model_id, str(embedding_list)
            )
            return str(row['id']) if row else ""

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
                str(embedding_list), limit
            )
            return [dict(row) for row in rows if row.get('similarity', 0) >= threshold]

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
            query = f"""
                SELECT
                    li.id, li.filename, li.storage_path, li.brand_name,
                    td.label, td.confidence
                FROM logo_images li
                JOIN training_data td ON td.image_id = li.id
                WHERE td.validated = true
                  {holdout_clause}
                ORDER BY li.created_at DESC
            """
        else:
            query = f"""
                SELECT
                    li.id, li.filename, li.storage_path, li.brand_name,
                    td.label, td.confidence
                FROM logo_images li
                LEFT JOIN training_data td ON td.image_id = li.id
                {holdout_clause_left}
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
