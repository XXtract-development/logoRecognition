import { beforeAll, expect, it, vi } from 'vitest';
import prisma from '../../core/db';
import sharp from 'sharp';
import { uploadReferenceLogo } from '../../services/storage';
vi.mock('fs', () => ({ default: { existsSync: vi.fn(() => true), readFileSync: vi.fn(() => Buffer.from('png')) } }));
import * as seed from '../../../scripts/seed-reference-logos';
import { resolveFieldType } from '../../services/field-type-mapping';
it('seed writes canonical metadata for every code', async () => {
  await (seed as any).seedReferenceLogos();
  for (const call of vi.mocked(prisma.referenceLogo.create).mock.calls) {
    const data = call[0].data;
    const resolved = resolveFieldType(data.t3777Code);
    expect(data).toMatchObject({ fieldType: resolved.fieldType, gs1Field: resolved.gs1Field });
  }
  expect(prisma.referenceLogo.create).toHaveBeenCalledTimes(20);
  expect(uploadReferenceLogo).toHaveBeenCalledTimes(20);
});

import fs from 'fs';
beforeAll(async () => {
  vi.mocked(fs.readFileSync).mockReturnValue(await sharp(Buffer.from('<svg width="32" height="32"><path stroke="black" d="M16 8V24"/></svg>')).png().toBuffer());
});
it('existing seeded references repair metadata without image work or new rows', async () => {
  vi.clearAllMocks();
  vi.mocked(prisma.referenceLogo.findUnique).mockResolvedValue({ id: 'existing', t3777Code: 'original-code', active: false, source: 'original' } as any);
  await seed.seedReferenceLogos();
  expect(prisma.referenceLogo.updateMany).toHaveBeenCalledTimes(20);
  for (const call of vi.mocked(prisma.referenceLogo.updateMany).mock.calls) {
    expect(Object.keys(call[0].data).sort()).toEqual(['fieldType', 'gs1Field']);
    expect(call[0].where).toEqual({ id: 'existing', t3777Code: 'original-code' });
  }
  expect(prisma.referenceLogo.create).not.toHaveBeenCalled();
  expect(uploadReferenceLogo).not.toHaveBeenCalled();
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

it('repairs missing-artwork existing rows and skips concurrent relabel without uploads', async () => {
  vi.clearAllMocks();
  vi.mocked(fs.existsSync).mockReturnValue(false);
  vi.mocked(prisma.referenceLogo.findUnique).mockResolvedValue({ id: 'existing', t3777Code: 'original-code' } as any);
  vi.mocked(prisma.referenceLogo.updateMany).mockResolvedValue({ count: 0 });
  await seed.seedReferenceLogos();
  expect(prisma.referenceLogo.updateMany).toHaveBeenCalledTimes(20);
  expect(prisma.referenceLogo.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'existing', t3777Code: 'original-code' } }));
  expect(uploadReferenceLogo).not.toHaveBeenCalled();
  expect(prisma.referenceLogo.create).not.toHaveBeenCalled();
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

it('blank seed does not upload or create a row', async () => {
  vi.clearAllMocks();
  vi.mocked(prisma.referenceLogo.findUnique).mockResolvedValue(null);
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } }).png().toBuffer());
  await expect(seed.seedReferenceLogos()).rejects.toThrow(/centrale beeldinhoud/);
  expect(uploadReferenceLogo).not.toHaveBeenCalled();
  expect(prisma.referenceLogo.create).not.toHaveBeenCalled();
});
