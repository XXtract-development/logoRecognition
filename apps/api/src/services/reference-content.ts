import sharp from 'sharp';

export const MAX_REFERENCE_PIXELS = 16_000_000;

/** Conservative admission guard only: central 80%, channel range > 8.
 * Not a semantic symbol classifier. Keep parameters aligned with reference_content.py.
 * White compositing ignores invisible RGB data in fully transparent pixels.
 */
export async function assertReferenceContent(buffer: Buffer): Promise<void> {
  const image = sharp(buffer, { limitInputPixels: MAX_REFERENCE_PIXELS });
  try {
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_REFERENCE_PIXELS) {
      throw new Error('Referentie overschrijdt de limiet van 16 miljoen pixels');
    }
  } catch (err) {
    if (err instanceof Error && /pixel limit|16 miljoen pixels/i.test(err.message)) {
      throw new Error('Referentie overschrijdt de limiet van 16 miljoen pixels');
    }
    throw err;
  }
  const { data, info } = await image
    .flatten({ background: '#ffffff' }).removeAlpha().toColourspace('srgb')
    .raw().toBuffer({ resolveWithObject: true });
  const marginX = Math.floor(info.width * 0.1);
  const marginY = Math.floor(info.height * 0.1);
  const minima = [255, 255, 255];
  const maxima = [0, 0, 0];
  for (let y = marginY; y < info.height - marginY; y++) {
    for (let x = marginX; x < info.width - marginX; x++) {
      for (let c = 0; c < 3; c++) {
        const value = data[(y * info.width + x) * info.channels + c];
        minima[c] = Math.min(minima[c], value);
        maxima[c] = Math.max(maxima[c], value);
      }
    }
  }
  if (!maxima.some((value, c) => value - minima[c] > 8)) {
    throw new Error('Referentie bevat geen zichtbare centrale beeldinhoud (uniform vlak of lege buitenrand).');
  }
}
