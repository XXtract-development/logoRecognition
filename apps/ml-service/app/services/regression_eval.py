"""Gold-set-regressie-eval — schaduw-evaluatie (Story 13.5, AD-4/AD-5).

De ml-kant van de kwaliteitspoort: meet precisie@drempel over de door de API
meegegeven, geresolvede gold-set (payload — de ml-service leest de
gold-set-tabellen NOOIT zelf, AD-4) tegen de ACTIEVE ``ReferenceEmbedding``
UNION de schaduwset. De schaduwset is uitsluitend de ``candidate_embeddings``
van ``in_batch``-kandidaten van de batch-onder-meting (AD-5) — nooit
gepromoveerde of afgewezen kandidaten (dubbeltelling-gat, adversarial F2).

Twee modi (één service):
  * schaduw-meting  : actief UNION schaduwset (de eigenlijke poortmeting);
  * nulmeting       : uitsluitend de actieve set (``include_shadow=False``),
    voor de eenmalige pre-vliegwiel-baseline (AC 2) en de verse nulmeting bij
    een verouderde baseline (AC 3).

SELF-MATCH-GUARD (AD-5, leave-one-out): per query-crop worden referenties én
schaduw-kandidaten met dezelfde inhouds-hash uitgesloten, zodat een gold-set-crop
die (later) referentie wordt nooit tegen zichzelf matcht (een 100%-zelfmatch die
de meting zou vervuilen). Referenties zonder bekende inhouds-hash (bestaande
``ReferenceLogo``-rijen) worden aanvullend op identiek ``cropPath`` uitgesloten —
zie de keuze-noot in ``_is_self_match``.

Meetdefinitie (AD-5-ASSUMPTION): precisie@drempel over de volledige gold-set.
Per query-crop met waar-label:
  * ``ECHT`` (het keurmerk is echt aanwezig): correct ⇔ de best-matchende
    referentie/schaduw van dezélfde klasse haalt de drempel (terecht herkend).
  * ``VALS`` (geen echt keurmerk): correct ⇔ GEEN referentie/schaduw van de
    klasse haalt de drempel (terecht niet herkend — geen vals-positief).
Per-sample-uitkomst (``correct`` bool) voedt zowel de precisie-aggregatie als de
"≥2 netto verslechterd"-tolerantie en de "meest getroffen klassen" (AC 5/6).

De pure functies (``best_similarity``, ``evaluate_sample``, ``evaluate_precision``)
kennen geen DB en geen embedding-model en zijn los te unit-testen (pytest,
synthetische vectoren). De DB-lezing (actieve referenties) en de query-embedding
leven in de router-laag (``app/api/flywheel.py``), niet hier.
"""

from typing import Any, Dict, List, Optional, Sequence

import numpy as np

#: Label-waarden (VarChar in de gold-set, géén enum — patroon elders in de stack).
LABEL_ECHT = "ECHT"
LABEL_VALS = "VALS"


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine-similariteit tussen twee vectoren, geklemd in [-1, 1].

    Een nul-vector (geen richting) levert 0,0 — nooit een deling door nul.
    Consistent met de pgvector-cosine elders in het vliegwiel (AD-9).
    """
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    sim = float(np.dot(a, b) / (na * nb))
    return max(-1.0, min(1.0, sim))


def _is_self_match(
    query_content_hash: Optional[str],
    query_crop_path: Optional[str],
    entry_content_hash: Optional[str],
    entry_crop_path: Optional[str],
) -> bool:
    """Leave-one-out-guard (AD-5): sluit een referentie/schaduw uit tegen een query.

    Keuze (task 1.2 gedocumenteerd): de primaire sleutel is de canonieke
    inhouds-hash — is die aan BEIDE kanten bekend en gelijk, dan is het dezelfde
    inhoud (zelfmatch). Bestaande ``ReferenceLogo``-rijen dragen geen bekende
    inhouds-hash; voor die gevallen valt de guard terug op identiek ``cropPath``.
    Zo matcht een gold-set-crop die (later) referentie werd nooit tegen zichzelf.
    """
    if (
        query_content_hash is not None
        and entry_content_hash is not None
        and query_content_hash == entry_content_hash
    ):
        return True
    if (
        query_crop_path is not None
        and entry_crop_path is not None
        and query_crop_path == entry_crop_path
    ):
        return True
    return False


def best_similarity(
    query: Dict[str, Any],
    entries: Sequence[Dict[str, Any]],
) -> float:
    """Hoogste cosine-similariteit van ``query`` tegen ``entries`` van dezélfde klasse.

    ``query``     : ``{embedding, t3777Code, contentHash?, cropPath?}``.
    ``entries``   : referentie- of schaduw-records
                    ``{embedding, t3777Code, contentHash?, cropPath?}``.

    Alleen entries van dezelfde ``t3777Code`` tellen mee (een keurmerk matcht
    binnen zijn klasse). De self-match-guard sluit entries met dezelfde inhoud
    uit (leave-one-out). Geen bruikbare entry → ``-1.0`` (geen enkele match).
    """
    q_emb = np.asarray(query["embedding"], dtype=np.float32)
    q_class = query.get("t3777Code")
    q_hash = query.get("contentHash")
    q_crop = query.get("cropPath")

    best = -1.0
    for e in entries:
        if e.get("t3777Code") != q_class:
            continue
        if _is_self_match(q_hash, q_crop, e.get("contentHash"), e.get("cropPath")):
            continue
        sim = _cosine_similarity(q_emb, np.asarray(e["embedding"], dtype=np.float32))
        if sim > best:
            best = sim
    return best


def evaluate_sample(
    query: Dict[str, Any],
    entries: Sequence[Dict[str, Any]],
    threshold: float,
) -> Dict[str, Any]:
    """Beoordeel één gold-set-crop tegen de referentie/schaduw-set (AD-5).

    ``recognized`` = de best-matchende entry van de klasse haalt de drempel.
    ``correct``    = de herkenning strookt met het waar-label:
        * ECHT  : recognized == True  (terecht herkend);
        * VALS  : recognized == False (terecht niet herkend, geen vals-positief).
    Retourneert de per-sample-uitkomst voor precisie-aggregatie + tolerantie.
    """
    label = query.get("label")
    top_sim = best_similarity(query, entries)
    recognized = top_sim >= threshold
    if label == LABEL_ECHT:
        correct = recognized
    elif label == LABEL_VALS:
        correct = not recognized
    else:
        # Onbekend label — behandel conservatief als fout (mag nooit meetellen als
        # "correct"); de API valideert labels bovendien vóór verzending.
        correct = False
    return {
        "id": query.get("id"),
        "t3777Code": query.get("t3777Code"),
        "label": label,
        "topSimilarity": float(top_sim),
        "recognized": bool(recognized),
        "correct": bool(correct),
    }


def evaluate_precision(
    query_records: Sequence[Dict[str, Any]],
    reference_entries: Sequence[Dict[str, Any]],
    shadow_entries: Optional[Sequence[Dict[str, Any]]],
    threshold: float,
) -> Dict[str, Any]:
    """Meet precisie@drempel over de gold-set (AD-5).

    Args:
        query_records: geresolvede gold-set-crops met per record een ingebedde
            ``embedding`` + ``label`` (ECHT/VALS) + ``t3777Code`` + ``contentHash``
            + ``cropPath``. Payload van de API (AD-4).
        reference_entries: actieve ``ReferenceEmbedding``-records
            ``{embedding, t3777Code, contentHash?, cropPath?}`` (read-only PG).
        shadow_entries: de schaduwset — uitsluitend ``in_batch``-kandidaten van
            deze batch (AD-5). ``None``/leeg = nulmeting-modus (geen schaduwset).
        threshold: matchdrempel (cosine).

    Returns:
        ``{precision, total, correct, perClass: {code: {total, correct,
        precision, worsenedCandidateCount?}}, samples: [per-sample-uitkomst]}``.

    Een lege gold-set levert ``precision=0.0``, ``total=0`` — de API vertaalt dat
    fail-closed (een poort kan niet meten zonder gold-set, AC 7).
    """
    entries: List[Dict[str, Any]] = list(reference_entries)
    if shadow_entries:
        entries = entries + list(shadow_entries)

    samples: List[Dict[str, Any]] = []
    per_class: Dict[str, Dict[str, Any]] = {}

    for q in query_records:
        outcome = evaluate_sample(q, entries, threshold)
        samples.append(outcome)
        code = outcome["t3777Code"]
        bucket = per_class.setdefault(code, {"total": 0, "correct": 0})
        bucket["total"] += 1
        if outcome["correct"]:
            bucket["correct"] += 1

    total = len(samples)
    correct = sum(1 for s in samples if s["correct"])
    precision = (correct / total) if total > 0 else 0.0

    for code, bucket in per_class.items():
        bucket["precision"] = (
            bucket["correct"] / bucket["total"] if bucket["total"] > 0 else 0.0
        )

    return {
        "precision": float(precision),
        "total": int(total),
        "correct": int(correct),
        "perClass": per_class,
        "samples": samples,
    }
