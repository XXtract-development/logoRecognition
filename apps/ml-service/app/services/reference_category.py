"""Resolve reference categories from the same JSON bundled by the API."""

import json
from pathlib import Path
from typing import Any, Tuple

# Docker runtime carries this exact source; development reads the repository file.
RUNTIME_MAPPING_PATH = (
    Path(__file__).resolve().parents[2] / "reference-code-mapping.json"
)
REPOSITORY_MAPPING_PATH = (
    Path(__file__).resolve().parents[3] / "api/src/services/reference-code-mapping.json"
)
MAPPING_PATH = (
    RUNTIME_MAPPING_PATH if RUNTIME_MAPPING_PATH.is_file() else REPOSITORY_MAPPING_PATH
)
MAPPING = json.loads(MAPPING_PATH.read_text(encoding="utf-8"))
ABSENT = object()


def resolve_reference_category(
    code: Any, field_type: Any = ABSENT, gs1_field: Any = ABSENT
) -> Tuple[str, str, str]:
    """Validate before I/O; specific categories win over the generic default."""
    if not isinstance(code, str) or not code.strip():
        raise ValueError("Reference code must be a nonempty string")
    normalized = code.strip().upper()
    normalized = MAPPING.get("aliases", {}).get(normalized, normalized)
    matches = [
        (field, group["gs1Field"])
        for field, group in MAPPING["categories"].items()
        if normalized in group["codes"]
    ]
    if len(matches) > 1:
        raise ValueError("Reference code belongs to multiple specific categories")
    expected_field, expected_gs1 = (
        matches[0]
        if matches
        else (MAPPING["default"]["fieldType"], MAPPING["default"]["gs1Field"])
    )
    if field_type is not ABSENT and field_type != expected_field:
        raise ValueError("field_type conflicts with canonical reference code")
    if gs1_field is not ABSENT and gs1_field != expected_gs1:
        raise ValueError("gs1_field conflicts with canonical reference code")
    return normalized, expected_field, expected_gs1


def assert_positive_reference_code(code):
    normalized = resolve_reference_category(code)[0]
    if normalized == "NO_PICTOGRAM" or normalized.startswith("GHS"):
        raise ValueError("Not a positive GHS reference class")
