"""
Artwork processing service — Epic 8 (Stories 8.2, 8.3, 8.4, 8.7).

Story 8.2 — PDF rasterization:
  rasterize_pdf(path, dpi=300) → list[dict]
  Each page: { source_file, page, image_path, dpi }
  Corrupt/password-protected PDF → [] or list of dicts with "error" key — NEVER raises.

Note: output PNGs are written to a temp directory and then should be uploaded
to MinIO by the caller. The rasterize_pdf function is path-agnostic (pure function
that only deals with local file system), per the story's ATDD contract.

Configuration:
  ARTWORK_RASTER_DPI   — default 300 (configured in the API gateway's env too)
"""

import os
import tempfile
from typing import Any, Dict, List

from app.core.logging import logger

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_DPI: int = int(os.environ.get("ARTWORK_RASTER_DPI", "300"))


# ---------------------------------------------------------------------------
# Story 8.2 — PDF rasterization
# ---------------------------------------------------------------------------


def rasterize_pdf(path: str, dpi: int = DEFAULT_DPI) -> List[Dict[str, Any]]:
    """
    Rasterize each page of a PDF to a PNG file.

    Returns a list of dicts:
      { "source_file": <path>, "page": int (1-based), "image_path": ".png", "dpi": int }

    On corrupt or password-protected input returns [] or dicts containing
    an "error" key — NEVER raises (soft-fail contract).

    Memory strategy: each page is processed and written to disk (tmpdir) before
    moving to the next, so we never hold all rasterized pages in memory.
    Callers should upload to MinIO and then clean up the temp directory.
    """
    try:
        import fitz  # PyMuPDF — AGPL, internal use only
    except ImportError:
        logger.error("PyMuPDF (fitz) not installed — cannot rasterize PDF")
        return [
            {
                "source_file": path,
                "page": 0,
                "error": "PyMuPDF not installed",
                "dpi": dpi,
            }
        ]

    results: List[Dict[str, Any]] = []
    source_file = os.path.basename(path)

    try:
        doc = fitz.open(path)
    except Exception as exc:
        logger.warning("Failed to open PDF", extra={"path": path, "error": str(exc)})
        return []

    # Password-protected / encrypted documents treated as corrupt
    if doc.needs_pass:
        logger.warning("PDF is password-protected", extra={"path": path})
        doc.close()
        return []

    if len(doc) == 0:
        logger.warning("PDF has no pages", extra={"path": path})
        doc.close()
        return []

    # Write output PNGs next to the source file so callers can upload them
    output_dir = os.path.dirname(path) or tempfile.gettempdir()

    for page_num in range(len(doc)):
        page = doc[page_num]
        try:
            # mat: scale matrix for the target DPI (default screen DPI is 72)
            mat = fitz.Matrix(dpi / 72.0, dpi / 72.0)
            pix = page.get_pixmap(matrix=mat)
            png_bytes = pix.tobytes("png")

            # Log embedded-image signal (useful for future vector-extraction work)
            try:
                image_list = page.get_images(full=False)
                if image_list:
                    logger.debug(
                        "PDF page has embedded images",
                        extra={
                            "path": path,
                            "page": page_num + 1,
                            "count": len(image_list),
                        },
                    )
            except Exception:
                pass  # Signal logging failure must never block the pipeline

            # Release pixmap memory immediately
            del pix

            # Write PNG alongside source
            base_name = os.path.splitext(os.path.basename(path))[0]
            png_filename = f"{base_name}.page-{page_num + 1}.png"
            png_path = os.path.join(output_dir, png_filename)

            with open(png_path, "wb") as f:
                f.write(png_bytes)
            del png_bytes

            results.append(
                {
                    "source_file": source_file,
                    "page": page_num + 1,
                    "image_path": png_path,
                    "dpi": dpi,
                }
            )
        except Exception as exc:
            logger.warning(
                "Failed to rasterize PDF page",
                extra={"path": path, "page": page_num + 1, "error": str(exc)},
            )
            results.append(
                {
                    "source_file": source_file,
                    "page": page_num + 1,
                    "error": str(exc),
                    "dpi": dpi,
                }
            )

    doc.close()
    return results
