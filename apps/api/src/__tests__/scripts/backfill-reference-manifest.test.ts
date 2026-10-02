import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as mapping from '../../services/field-type-mapping';
import * as backfill from '../../scripts/backfill-reference-logo-field-type';
import prisma from '../../core/db';
const target = { database: 'logo_recognition', serverAddress: '10.0.0.6/32', serverPort: 5432 };
const item = () => backfill.planBackfill([{ id: 'c54a9057-57bf-4baa-9ea6-401f45799da8', t3777Code: 'NUTRISCORE_A', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: null, active: true }])[0];
const manifest = () => ({ version: 2, environment: 'acc', target, items: [item()] });
const row = { t3777_code: 'NUTRISCORE_A', active: true, field_type: 'PackagingMarkedLabelAccreditationCode', gs1_field: null };
describe('target-bound approved backfill', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.$queryRaw).mockResolvedValue([target]); });
  it('has no public unvalidated write entry point', () => expect(backfill).not.toHaveProperty('applyOne'));
  it('validates exact version2 scope', () => expect(backfill.validateManifest(manifest())).toEqual([item()]));
  it.each(['duplicate', 'target', 'inactive', 'action', 'missing-code', 'missing-active', 'version', 'environment', 'database', 'address', 'port'])('rejects invalid %s before database work', async kind => {
    const input: any = manifest();
    if (kind === 'duplicate') input.items.push({ ...input.items[0] });
    if (kind === 'target') input.items[0].targetFieldType = 'DietTypeCode';
    if (kind === 'inactive') input.items[0].currentActive = false;
    if (kind === 'action') input.items[0].action = 'skip-unchanged';
    if (kind === 'missing-code') delete input.items[0].t3777Code;
    if (kind === 'missing-active') delete input.items[0].currentActive;
    if (kind === 'version') input.version = 1;
    if (kind === 'environment') input.environment = '';
    if (kind === 'database') input.target = { ...target, database: '' };
    if (kind === 'address') input.target = { ...target, serverAddress: null };
    if (kind === 'port') input.target = { ...target, serverPort: 0 };
    await expect(backfill.applyManifest(input)).rejects.toThrow();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(['database', 'serverAddress', 'serverPort'])('fails closed on wrong target %s', async key => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ ...target, [key]: key === 'serverPort' ? 5433 : 'other' }]);
    await expect(backfill.applyManifest(manifest())).rejects.toThrow(/target/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.referenceLogo.update).not.toHaveBeenCalled();
  });
  it.each([
    ['missing-row', null], ['code-changed', { ...row, t3777_code: 'VEGAN' }],
    ['active-changed', { ...row, active: false }], ['metadata-changed', { ...row, field_type: 'DietTypeCode' }],
    ['metadata-changed', { ...row, gs1_field: 'dietTypeCode' }],
  ])('reports row race %s', async (reason, current) => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([target]).mockResolvedValueOnce(current ? [current] : []);
    expect(await backfill.applyManifest(manifest())).toMatchObject({ written: 0, skippedRace: 1, status: 'incomplete', results: [{ id: item().id, status: 'skipped-race', reason }] });
    expect(prisma.referenceLogo.update).not.toHaveBeenCalled();
  });
  it('writes approved metadata only and retries idempotently', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([target]).mockResolvedValueOnce([row]);
    expect(await backfill.applyManifest(manifest())).toMatchObject({ written: 1, skippedRace: 0, status: 'complete', results: [{ id: item().id, status: 'written', reason: 'updated' }] });
    expect(prisma.referenceLogo.findMany).not.toHaveBeenCalled();
    expect(prisma.referenceLogo.update).toHaveBeenCalledWith({ where: { id: item().id }, data: { fieldType: 'NutritionalScore', gs1Field: 'nutritionalScore' } });
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([target]).mockResolvedValueOnce([{ ...row, field_type: 'NutritionalScore', gs1_field: 'nutritionalScore' }]);
    expect(await backfill.applyManifest(manifest())).toMatchObject({ written: 0, skippedRace: 0, alreadyCorrect: 1, status: 'complete', results: [{ reason: 'already-correct' }] });
    expect(prisma.referenceLogo.update).toHaveBeenCalledOnce();
  });
  it('valid file preview performs zero Prisma calls', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-manifest-preview-'));
    const filename = path.join(dir, 'manifest.json');
    try {
      fs.writeFileSync(filename, JSON.stringify(manifest()));
      await backfill.runBackfill(['--manifest', filename]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      for (const method of Object.values(prisma.referenceLogo)) if (vi.isMockFunction(method)) expect(method).not.toHaveBeenCalled();
      expect(prisma.$connect).not.toHaveBeenCalled();
      expect(prisma.$disconnect).not.toHaveBeenCalled();
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('requires generation environment before database calls', async () => {
    await expect(backfill.runBackfill(['--manifest-output', '/tmp/no-generation.json'])).rejects.toThrow(/environment/);
    expect(prisma.referenceLogo.findMany).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('rejects unscoped apply', async () => {
    await expect(backfill.runBackfill(['--apply'])).rejects.toThrow('--manifest');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('planner evidence and CLI results', () => {
  beforeEach(() => vi.clearAllMocks());
  it('preserves resolved and unresolved ambiguity with IDs and notes outside writable items', () => {
    const resolved = item();
    const unresolved: any = { ...resolved, id: 'unresolved', t3777Code: 'CONFLICT', action: 'skip-ambiguous-unresolved', targetFieldType: null, targetGs1Field: null, resolution: { code: 'CONFLICT', ambiguous: true, resolution: 'unresolved', fieldType: null, gs1Field: null, note: 'two specific lists' } };
    const evidence = backfill.ambiguityEvidence([resolved, unresolved]);
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({ id: resolved.id, t3777Code: 'NUTRISCORE_A', resolution: { resolution: 'default-overlap-resolved', note: expect.any(String) } });
    expect(evidence[1]).toMatchObject({ id: 'unresolved', t3777Code: 'CONFLICT', resolution: { resolution: 'unresolved', note: 'two specific lists' } });
  });
  it('generation includes measured target and explicit environment without writes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-generation-'));
    const filename = path.join(dir, 'manifest.json');
    vi.mocked(prisma.referenceLogo.findMany).mockResolvedValue([{ id: item().id, t3777Code: 'NUTRISCORE_A', fieldType: 'PackagingMarkedLabelAccreditationCode', gs1Field: null, active: true }] as any);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([target]);
    try {
      await backfill.runBackfill(['--manifest-output', filename, '--environment', 'acc']);
      const output = JSON.parse(fs.readFileSync(filename, 'utf8'));
      expect(output).toMatchObject({ version: 2, environment: 'acc', target, items: [item()] });
      expect(prisma.$queryRaw).toHaveBeenCalledOnce();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.referenceLogo.update).not.toHaveBeenCalled();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('CLI emits full incomplete outcomes and nonzero exit status', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-cli-'));
    const filename = path.join(dir, 'manifest.json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const prior = process.exitCode;
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([target]).mockResolvedValueOnce([]);
    try {
      fs.writeFileSync(filename, JSON.stringify(manifest()));
      await backfill.runBackfill(['--apply', '--manifest', filename]);
      expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ written: 0, skippedRace: 1, status: 'incomplete', results: [{ id: item().id, reason: 'missing-row' }] });
      expect(process.exitCode).toBe(1);
    } finally { process.exitCode = prior; log.mockRestore(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

it('actual CLI preview wrapper performs zero Prisma calls including disconnect', async () => {
  vi.clearAllMocks();
  const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/backfill-reference-logo-field-type.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const cliModule = {};
  const loader: any = (name: string) => name === '../core/db' ? { default: prisma, __esModule: true }
    : name.includes('field-type-mapping') ? mapping : name === 'node:fs' ? { readFileSync: () => JSON.stringify(manifest()) } : require(name);
  loader.main = cliModule;
  vm.runInNewContext(compiled, { exports: {}, module: cliModule, require: loader, console: { log: vi.fn(), error: vi.fn() }, process: { argv: ['node', 'script', '--manifest', 'offline.json'] } });
  await new Promise(resolve => setImmediate(resolve));
  expect(prisma.$disconnect).not.toHaveBeenCalled();
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
  expect(prisma.referenceLogo.findMany).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
