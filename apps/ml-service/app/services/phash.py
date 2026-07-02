"""Canonieke inhouds-hash-service (Story 13.1, AD-14).

De inhouds-hash heeft **exact één implementatie** — deze module. De API berekent
nooit zelf een inhouds-hash; er bestaat geen Node-fallback (AD-14). Twee hashes
worden hier gedefinieerd:

* ``content_hash`` — SHA-256 over de pixel-buffer ná gepinde normalisatie. Dit is
  de canonieke sleutel voor nominatie-uniciteit, ontdubbeling en het
  hard-negative-geheugen (consumenten: 13.2, 13.4, 14.1).
* ``perceptual_hash`` — pHash (ImageHash) als hex-string, voor de Hamming-dedup
  van 13.4.

------------------------------------------------------------------------------
NORMALISATIE IS EEN CONTRACT — LEES DIT VOOR JE IETS WIJZIGT
------------------------------------------------------------------------------
De canonieke hash is alleen reproduceerbaar zolang de normalisatie byte-voor-byte
identiek blijft. De onderstaande constantes (``NORMALIZE_SIZE``,
``NORMALIZE_RESAMPLE``, ``NORMALIZE_MODE``) en de gepinde bibliotheekversies
(Pillow==10.2.0, ImageHash==4.3.2) leggen dat contract vast.

**Elke wijziging van een van deze constantes of van een van die versies
invalideert ALLE bestaande content-hashes.** Dat breekt de ``@@unique``-garantie
en de hard-negative-blokkade van 13.2 en later: bestaande crops krijgen dan een
andere hash dan hun al opgeslagen tweelingen, waardoor ontdubbeling en het
hernominatie-slot stil falen. Wijzig deze waarden dus nooit zonder een expliciete
migratie/herberekening van alle opgeslagen hashes.
"""

import hashlib
import io

from PIL import Image

# --- Gepinde normalisatie-constantes (het hash-contract, zie module-docstring) ---

#: Kleurmodel waarnaar elke afbeelding wordt geconverteerd vóór hashing. RGB
#: pint het kanaal-aantal (3) en de kanaalvolgorde, zodat bron-varianten
#: (grayscale, RGBA, palette) tot dezelfde buffer normaliseren.
NORMALIZE_MODE = "RGB"

#: Vaste vierkante doelresolutie (N×N) van de genormaliseerde pixel-buffer.
#: Legt het aantal pixels — en dus de lengte van de gehashte buffer — vast.
NORMALIZE_SIZE = 256

#: Vastgelegde resampling-interpolatie voor de resize. LANCZOS is deterministisch
#: en versie-stabiel binnen de gepinde Pillow==10.2.0.
NORMALIZE_RESAMPLE = Image.Resampling.LANCZOS

#: pHash hash-grootte (ImageHash). 8 → 64-bit hash, de standaard voor de
#: Hamming-dedup van 13.4.
PHASH_SIZE = 8


def _normalize(image: Image.Image) -> Image.Image:
    """Pin een PIL-afbeelding op het canonieke normalisatie-contract.

    RGB-conversie → vaste N×N resize met vastgelegde interpolatie. Deterministisch:
    dezelfde bron-pixels leveren altijd byte-identieke output, onafhankelijk van
    het oorspronkelijke bestandsformaat (PNG, BMP, ...) of kleurmodel.
    """
    normalized = image.convert(NORMALIZE_MODE)
    normalized = normalized.resize(
        (NORMALIZE_SIZE, NORMALIZE_SIZE), resample=NORMALIZE_RESAMPLE
    )
    return normalized


def content_hash(image: Image.Image) -> str:
    """SHA-256 over de pixel-buffer ná gepinde normalisatie (AD-14).

    Dit is de canonieke inhouds-hash. Hij hasht de genormaliseerde pixels zelf —
    niet de bron-bestandsbytes — zodat twee crops met identieke beeldinhoud maar
    verschillend bestandsformaat dezelfde hash krijgen.

    Wijziging van de normalisatie-constantes of de Pillow-versie invalideert alle
    bestaande hashes (zie module-docstring).
    """
    normalized = _normalize(image)
    return hashlib.sha256(normalized.tobytes()).hexdigest()


def perceptual_hash(image: Image.Image) -> str:
    """Perceptual hash (pHash) als hex-string via ImageHash (voor 13.4).

    Deterministisch over dezelfde genormaliseerde invoer. Losstaand van de
    canonieke content-hash: pHash dient de tolerante Hamming-dedup, content_hash
    de exacte uniciteit.
    """
    import imagehash

    normalized = _normalize(image)
    return str(imagehash.phash(normalized, hash_size=PHASH_SIZE))


def load_image_from_bytes(data: bytes) -> Image.Image:
    """Decodeer ruwe bytes naar een PIL-afbeelding.

    Een onleesbare buffer geeft een ``ValueError`` — de aanroeper vertaalt dat
    naar een HTTP-fout. Nooit een fallback-hash (AD-14, fail-closed).
    """
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        return image
    except Exception as exc:  # onleesbaar/corrupt beeld
        raise ValueError(f"Kon afbeelding niet decoderen: {exc}") from exc
