import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { assertReferenceContent } from '../../services/reference-content';

const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${body}</svg>`);
describe('conservative reference content admission', () => {
  it.each(['<rect width="200" height="200" fill="white"/>', '', '<rect x="1" y="1" width="198" height="198" fill="none" stroke="black"/>'])('rejects a blank surface or outside-only frame: %s', async (body) => {
    await expect(assertReferenceContent(svg(body))).rejects.toThrow(/centrale beeldinhoud/);
  });
  it.each(['black', '#54949e', 'white'])('accepts sparse central line art in %s', async (color) => {
    const background = color === 'white' ? '<rect width="200" height="200" fill="black"/>' : '';
    await expect(assertReferenceContent(svg(`${background}<path d="M100 70V130" stroke="${color}"/>`))).resolves.toBeUndefined();
  });
  it('ignores invisible RGB in fully transparent images', async () => {
    const pixels = Buffer.alloc(32 * 32 * 4);
    pixels[0] = 255;
    const bytes = await sharp(pixels, { raw: { width: 32, height: 32, channels: 4 } }).png().toBuffer();
    await expect(assertReferenceContent(bytes)).rejects.toThrow(/centrale beeldinhoud/);
  });
  it('fails closed on undecodable bytes', async () => {
    await expect(assertReferenceContent(Buffer.from('invalid'))).rejects.toThrow();
  });
});

import fs from 'fs';
import path from 'path';
it('rejects the sanitized actual blank production print frame', async () => {
  const fixture = path.resolve(__dirname, '../../../../ml-service/tests/fixtures/reference-content/blank-print-frame.png');
  await expect(assertReferenceContent(fs.readFileSync(fixture))).rejects.toThrow(/centrale beeldinhoud/);
});

const sharedDirectory = path.resolve(__dirname, '../../../../ml-service/tests/fixtures/reference-content');
const cases: Array<{ file: string; accepted: boolean; sha256: string }> = JSON.parse(fs.readFileSync(path.join(sharedDirectory, 'contract-cases.json'), 'utf8'));
it.each(cases)('shared encoded contract: $file accepted=$accepted', async ({ file, accepted, sha256 }) => {
  const { createHash } = await import('crypto');
  const bytes = fs.readFileSync(path.join(sharedDirectory, file));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
  if (accepted) await expect(assertReferenceContent(bytes)).resolves.toBeUndefined();
  else await expect(assertReferenceContent(bytes)).rejects.toThrow(/centrale beeldinhoud/);
});
it('accepts sanitized actual official People & Nature artwork', async () => {
  const { createHash } = await import('crypto');
  const provenance = JSON.parse(fs.readFileSync(path.join(sharedDirectory, 'positive-provenance.json'), 'utf8'));
  const bytes = fs.readFileSync(path.join(sharedDirectory, provenance.fixture));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(provenance.fixtureFileSha256);
  await expect(assertReferenceContent(bytes)).resolves.toBeUndefined();
});
it.each(['png', 'svg'])('rejects oversized declared %s before raw expansion', async (format) => {
  const bytes = format === 'png' ? fs.readFileSync(path.join(sharedDirectory, 'oversized-declared.png')) : Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="5000" height="5000"/>');
  await expect(assertReferenceContent(bytes)).rejects.toThrow(/16 miljoen pixels/);
});
