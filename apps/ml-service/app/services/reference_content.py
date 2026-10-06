"""Conservative admission guard, never used for evaluation query filtering.

Keep the central 80% / channel range > 8 contract aligned with reference-content.ts.
This detects evident blank frames only, not whether a symbol is semantically valid.
"""

from PIL import Image


def assert_reference_content(image: Image.Image) -> None:
    image.load()
    rgba = image.convert("RGBA")
    visible = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    visible.alpha_composite(rgba)
    visible = visible.convert("RGB")
    width, height = visible.size
    mx, my = int(width * 0.1), int(height * 0.1)
    extrema = visible.crop((mx, my, width - mx, height - my)).getextrema()
    if not any(high - low > 8 for low, high in extrema):
        raise ValueError(
            "Referentie bevat geen zichtbare centrale beeldinhoud (uniform vlak of lege buitenrand)."
        )
