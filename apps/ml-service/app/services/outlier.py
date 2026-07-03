"""Per-batch outlier-audit-service (Story 13.4, AD-9).

Bepaalt voor kandidaat-embeddings de afstand tot het klasse-centroid van hun
keurmerk-klasse en velt een grens-oordeel (``is_outlier``). Dit is de ml-kant van
de per-batch outlier-guardrail: de API stuurt de kandidaat-vectoren, de
ml-service leest de actieve referentie-embeddings van de klasse (read-only,
``get_reference_embeddings_for_class``) en berekent het centroid.

Twee afnemers, één endpoint (AD-9):
  * de per-batch outlier-guardrail hier (13.4) — absolute afstandsgrens;
  * de wekelijkse bibliotheek-audit (14.3) — hergebruikt dezelfde functies met
    een top-percentiel-grens. ``percentile`` parametriseert dat.

De afstandsmaat is cosine-afstand (1 − cosine-similariteit), consistent met de
rest van de vliegwiel-dedup (AD-9 "pgvector-cosine"). De grens is:
  * bij ``percentile`` gezet: het opgegeven percentiel van de kandidaat-afstanden
    (14.3-pad);
  * anders: de absolute default-grens ``DEFAULT_OUTLIER_DISTANCE`` (13.4-pad).

De pure functies (``compute_centroid``, ``cosine_distance``, ``audit_candidates``)
kennen geen DB en zijn los te unit-testen (pytest). De DB-lezing zit in de
router-laag, niet hier.
"""

from typing import Dict, List, Optional

import numpy as np

#: Absolute cosine-afstandsgrens waarboven een kandidaat een outlier is als er
#: geen percentiel is opgegeven (13.4-pad). Startwaarde 0,35 — "strak genoeg" om
#: duidelijke buitenbeentjes te weren zonder normale variatie af te wijzen;
#: documenteren zodat 14.3 hem kan bijstellen.
DEFAULT_OUTLIER_DISTANCE = 0.35


def compute_centroid(vectors: List[np.ndarray]) -> Optional[np.ndarray]:
    """Bereken het (L2-genormaliseerde) klasse-centroid uit referentie-vectoren.

    Elke vector wordt eerst L2-genormaliseerd zodat het centroid richting-gebaseerd
    is (cosine-geometrie), daarna gemiddeld en opnieuw genormaliseerd. Vectoren met
    norm 0 worden overgeslagen. Retourneert ``None`` als er geen bruikbare vector is
    (leeg-klasse-randgeval) — de aanroeper definieert dan het antwoord.
    """
    normalized: List[np.ndarray] = []
    for v in vectors:
        arr = np.asarray(v, dtype=np.float32)
        norm = float(np.linalg.norm(arr))
        if norm > 0:
            normalized.append(arr / norm)
    if not normalized:
        return None
    mean = np.mean(np.stack(normalized), axis=0)
    mean_norm = float(np.linalg.norm(mean))
    if mean_norm == 0:
        return None
    return mean / mean_norm


def cosine_distance(a: np.ndarray, centroid: np.ndarray) -> float:
    """Cosine-afstand (1 − cosine-similariteit) tussen ``a`` en het centroid.

    Het centroid wordt genormaliseerd aangenomen; ``a`` wordt hier genormaliseerd.
    Een nul-vector geeft de maximale afstand 1,0 (geen richting = maximaal ver).
    Resultaat geklemd in [0, 2] (cosine-afstand-bereik).
    """
    arr = np.asarray(a, dtype=np.float32)
    norm = float(np.linalg.norm(arr))
    if norm == 0:
        return 1.0
    similarity = float(np.dot(arr / norm, centroid))
    distance = 1.0 - similarity
    # Numerieke afronding kan net buiten [0, 2] vallen; klem.
    return max(0.0, min(2.0, distance))


def audit_candidates(
    candidates: List[Dict[str, object]],
    reference_vectors: List[np.ndarray],
    percentile: Optional[float] = None,
) -> Dict[str, object]:
    """Beoordeel kandidaten tegen het klasse-centroid van hun klasse.

    Args:
        candidates: lijst van ``{"id": str, "embedding": Sequence[float]}``.
        reference_vectors: actieve referentie-embeddings van de klasse (voor het
            centroid). Leeg → leeg-klasse-randgeval.
        percentile: optionele percentiel-grens (0..1). Gezet → 14.3-pad
            (top-(1-p)% is outlier); weg → 13.4-pad (absolute default-grens).

    Returns:
        ``{"centroid_size": int, "threshold": float, "results": [{id, distance,
        is_outlier}]}``.

    Leeg-klasse-randgeval (0 of geen bruikbare referentie): er is geen centroid,
    dus GEEN kandidaat wordt als outlier bestempeld (``is_outlier=False``,
    ``distance=0.0``) — de outlier-guardrail mag niet blokkeren op een klasse die
    (nog) geen referentie heeft. ``centroid_size=0`` maakt dat expliciet.
    """
    centroid = compute_centroid(reference_vectors)

    if centroid is None:
        return {
            "centroid_size": 0,
            "threshold": 0.0,
            "results": [
                {"id": str(c.get("id")), "distance": 0.0, "is_outlier": False}
                for c in candidates
            ],
        }

    distances: List[float] = []
    ids: List[str] = []
    for c in candidates:
        emb = np.asarray(c.get("embedding", []), dtype=np.float32)
        distances.append(cosine_distance(emb, centroid))
        ids.append(str(c.get("id")))

    if percentile is not None and distances:
        # 14.3-pad: de grens is het opgegeven percentiel van de kandidaat-afstanden.
        # np.quantile met een percentiel-fractie (0..1). Kandidaten STRIKT boven de
        # grens zijn outlier (op de grens = binnen).
        clamped = max(0.0, min(1.0, percentile))
        threshold = float(np.quantile(distances, clamped)) if distances else 0.0
    else:
        # 13.4-pad: absolute default-grens.
        threshold = DEFAULT_OUTLIER_DISTANCE

    results = [
        {"id": ids[i], "distance": float(distances[i]), "is_outlier": distances[i] > threshold}
        for i in range(len(ids))
    ]

    return {
        "centroid_size": len(reference_vectors),
        "threshold": float(threshold),
        "results": results,
    }
