"""
Similarity search service for logo matching.
Uses vector embeddings and pgvector for efficient similarity search.
"""

import numpy as np
from typing import Optional, List, Dict, Any
from PIL import Image

from app.core.config import settings
from app.core.logging import logger
from app.services.database import db_service
from app.ml.model_manager import model_manager


class SimilarityService:
    """Logo similarity search using embeddings."""

    def __init__(self):
        self._embedding_cache: Dict[str, np.ndarray] = {}
        self._cache_max_size = 1000

    async def find_matching_logo(
        self,
        image: Image.Image,
        threshold: float = 0.8,
        top_k: int = 3,
    ) -> Optional[Dict[str, Any]]:
        """
        Find the best matching logo for an image.

        Args:
            image: PIL Image of the detected logo region
            threshold: Minimum similarity threshold (0-1)
            top_k: Number of candidates to consider

        Returns:
            Best matching logo info or None if no match above threshold
        """
        try:
            # Generate embedding for the query image
            embedding = await model_manager.generate_embedding(image)

            # Search for similar logos in database
            matches = await db_service.find_similar_logos(
                embedding=embedding,
                limit=top_k,
                threshold=threshold,
            )

            if not matches:
                logger.debug("No matching logos found above threshold")
                return None

            # Return best match
            best_match = matches[0]
            logger.debug(
                f"Found match: {best_match['category']}/{best_match['value']} "
                f"(similarity: {best_match.get('similarity', 0):.3f})"
            )

            return {
                "logo_id": str(best_match["logo_id"]),
                "category": best_match["category"],
                "value": best_match["value"],
                "confidence": best_match.get("similarity", 0),
                "alternatives": [
                    {
                        "logo_id": str(m["logo_id"]),
                        "category": m["category"],
                        "value": m["value"],
                        "confidence": m.get("similarity", 0),
                    }
                    for m in matches[1:top_k]
                ],
            }

        except Exception as e:
            logger.error(f"Similarity search failed: {e}")
            return None

    async def match_detections(
        self,
        detections: List[Dict[str, Any]],
        original_image: Image.Image,
        threshold: float = 0.8,
    ) -> List[Dict[str, Any]]:
        """
        Match a list of detections with known logos.

        Args:
            detections: List of detection dicts with 'bbox' keys
            original_image: Full original image
            threshold: Similarity threshold

        Returns:
            Detections enriched with logo information
        """
        enriched = []

        for detection in detections:
            bbox = detection.get("bbox", {})

            try:
                # Crop the detection region
                crop = original_image.crop((
                    bbox.get("x", 0),
                    bbox.get("y", 0),
                    bbox.get("x", 0) + bbox.get("width", 100),
                    bbox.get("y", 0) + bbox.get("height", 100),
                ))

                # Find matching logo
                match = await self.find_matching_logo(crop, threshold)

                if match:
                    detection["category"] = match["category"]
                    detection["value"] = match["value"]
                    detection["logo_id"] = match["logo_id"]
                    detection["match_confidence"] = match["confidence"]
                    detection["alternatives"] = match.get("alternatives", [])
                else:
                    # No match found - mark as unknown
                    detection["category"] = "unknown"
                    detection["value"] = "unidentified"
                    detection["logo_id"] = None
                    detection["match_confidence"] = 0

            except Exception as e:
                logger.warning(f"Failed to match detection: {e}")
                detection["category"] = "error"
                detection["value"] = "match_failed"
                detection["error"] = str(e)

            enriched.append(detection)

        return enriched

    async def store_logo_embedding(
        self,
        logo_id: str,
        image: Image.Image,
        model_id: Optional[str] = None,
    ) -> str:
        """
        Generate and store embedding for a logo.

        Args:
            logo_id: Database ID of the logo
            image: Representative image of the logo
            model_id: ID of the model used for embedding (uses active model if None)

        Returns:
            ID of the stored embedding
        """
        # Generate embedding
        embedding = await model_manager.generate_embedding(image)

        # Get active model ID if not provided
        if not model_id:
            active_model = await db_service.get_active_model()
            model_id = str(active_model["id"]) if active_model else "default"

        # Store in database
        embedding_id = await db_service.store_embedding(
            logo_id=logo_id,
            model_id=model_id,
            embedding=embedding,
        )

        logger.info(f"Stored embedding for logo {logo_id}")
        return embedding_id

    async def rebuild_embeddings(
        self,
        model_id: str,
        batch_size: int = 100,
    ) -> Dict[str, Any]:
        """
        Rebuild all logo embeddings using a new model.
        Used after training a new model.

        Args:
            model_id: ID of the new model to use
            batch_size: Number of logos to process at once

        Returns:
            Summary of rebuild operation
        """
        logos = await db_service.get_all_logos()

        processed = 0
        errors = 0

        for logo in logos:
            try:
                # Get representative images for this logo.
                # include_holdout=True: the embedding index must cover EVERY
                # validated image — excluding the holdout set here would
                # silently drop logos whose only samples are holdout-marked.
                images = await db_service.get_training_images(include_holdout=True)
                logo_images = [
                    img for img in images
                    if img.get("label") == logo["value"]
                ]

                if not logo_images:
                    logger.warning(f"No images for logo {logo['value']}")
                    continue

                # Use first image as representative
                # TODO: Could generate multiple embeddings or average
                img_info = logo_images[0]
                from app.services.storage import storage_service
                image_bytes = storage_service.get_training_image(img_info["storage_path"])

                import io
                image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

                await self.store_logo_embedding(
                    logo_id=str(logo["id"]),
                    image=image,
                    model_id=model_id,
                )

                processed += 1

            except Exception as e:
                logger.error(f"Failed to rebuild embedding for logo {logo['id']}: {e}")
                errors += 1

        return {
            "total_logos": len(logos),
            "processed": processed,
            "errors": errors,
            "model_id": model_id,
        }

    async def rebuild_reference_embeddings(self) -> Dict[str, Any]:
        """Rebuild the reference keurmerk embedding index (Epic 8, Story 8.4).

        Generates exactly ONE embedding per ACTIVE reference variant from the
        keurmerk reference library (Story 7.3) and stores it in the dedicated
        ``reference_embeddings`` table. Intended to run at startup and on
        library refresh.

        This mirrors ``rebuild_embeddings`` but is deliberately separate (Dev
        Notes: do NOT extend the logo rebuild). Reference embeddings are NOT
        holdout-filtered — they are independent of the training/holdout split.

        The table is cleared first so the rebuild is idempotent and never leaves
        stale embeddings for variants that were soft-deleted since the last run.
        """
        import io

        from app.services.storage import storage_service

        references = await db_service.get_active_reference_logos()

        await db_service.clear_reference_embeddings()

        processed = 0
        errors = 0

        for ref in references:
            try:
                image_bytes = storage_service.get_training_image(ref["storage_path"])
                image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

                embedding = await model_manager.generate_embedding(image)

                await db_service.store_reference_embedding(
                    reference_logo_id=str(ref["id"]),
                    embedding=embedding,
                )
                processed += 1
            except Exception as e:
                logger.error(
                    f"Failed to build reference embedding for {ref.get('t3777_code')}"
                    f"/{ref.get('variant_label')}: {e}"
                )
                errors += 1

        # Story 8-N1: an ivfflat index built on the (just-cleared) empty table is
        # degenerate — index scans silently return 0 rows. REINDEX after every
        # rebuild that actually stored embeddings; a REINDEX failure is a normal
        # error in the summary, never a crash of the rebuild itself.
        if processed > 0:
            try:
                await db_service.reindex_reference_embeddings()
                logger.info(
                    f"Reference embeddings REINDEX complete after rebuild ({processed} embeddings)"
                )
            except Exception as reindex_err:
                logger.error(f"REINDEX after reference rebuild failed (non-fatal): {reindex_err}")
                errors += 1
        else:
            logger.warning(
                "rebuild_reference_embeddings stored 0 embeddings — REINDEX skipped; "
                "the ivfflat index may be degenerate until the next non-empty rebuild"
            )

        return {
            "total_references": len(references),
            "processed": processed,
            "errors": errors,
        }

    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        self._embedding_cache.clear()
        logger.info("Embedding cache cleared")


# Global similarity service instance
similarity_service = SimilarityService()
