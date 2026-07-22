/**
 * Story 13.9 — geannoteerde crops worden als 3-kanaals RGB opgeslagen.
 *
 * De opslag-pijplijn in artwork-pipeline.ts is `sharp(buffer).extract(...)
 * .removeAlpha().png()`. Deze test verifieert het gedrag-kritieke deel: op een
 * RGBA-bron levert de pijplijn 3 kanalen (geen alfa); op een RGB-bron blijft het
 * 3 kanalen (removeAlpha = no-op). Zo kan een RGBA-bron-artwork nooit meer een
 * RGBA-crop opleveren (die 13.8's regressiepoort-embedding brak).
 */
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

async function cropPipeline(src: Buffer): Promise<sharp.Metadata> {
  const out = await sharp(src)
    .extract({ left: 1, top: 1, width: 8, height: 8 })
    .removeAlpha()
    .png()
    .toBuffer();
  return sharp(out).metadata();
}

describe('Story 13.9 — annot-crop RGB-opslag', () => {
  it('RGBA-bron → crop heeft 3 kanalen (geen alfa)', async () => {
    const rgba = await sharp({
      create: { width: 16, height: 16, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    const meta = await cropPipeline(rgba);
    expect(meta.channels).toBe(3);
    expect(meta.hasAlpha).toBe(false);
  });

  it('RGB-bron → crop blijft 3 kanalen (removeAlpha no-op)', async () => {
    const rgb = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();
    const meta = await cropPipeline(rgb);
    expect(meta.channels).toBe(3);
    expect(meta.hasAlpha).toBe(false);
  });
});
