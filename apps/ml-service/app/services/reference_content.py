"""Conservative admission guard, never used for evaluation query filtering.

Keep the central 80% / channel range > 8 contract aligned with reference-content.ts.
This detects evident blank frames only, not whether a symbol is semantically valid.
The same rule rejects blank crops before classification (artwork.py classify_artwork).
"""

from PIL import Image


def has_visible_content(image: Image.Image) -> bool:
    """True when the central 80% of the image, composited on white, is not a flat surface."""
    image.load()
    rgba = image.convert("RGBA")
    visible = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    visible.alpha_composite(rgba)
    visible = visible.convert("RGB")
    width, height = visible.size
    mx, my = int(width * 0.1), int(height * 0.1)
    extrema = visible.crop((mx, my, width - mx, height - my)).getextrema()
    return any(high - low > 8 for low, high in extrema)


def assert_reference_content(image: Image.Image) -> None:
    if not has_visible_content(image):
        raise ValueError(
            "Referentie bevat geen zichtbare centrale beeldinhoud (uniform vlak of lege buitenrand)."
        )
