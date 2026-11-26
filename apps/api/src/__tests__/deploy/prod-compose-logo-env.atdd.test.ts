// R1 (manifest Nutri-Score prod, item 77) — ATDD, written before the change:
// docker-compose.prod.yml has no env_file, so every variable the code reads must be named in it.
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../../..');
const compose = fs.readFileSync(path.join(repoRoot, 'docker-compose.prod.yml'), 'utf8');

/** `environment:` lines (6-space indent) of one top-level service. */
function envLines(service: string): string[] {
  const m = compose.match(new RegExp(`^ {2}${service}:\\n([\\s\\S]*?)(?=^ {2}\\S|^\\S|(?![\\s\\S]))`, 'm'));
  const env = m?.[1].match(/^ {4}environment:\n((?: {6}.*\n)+)/m);
  return env ? env[1].split('\n').filter(Boolean) : [];
}
const has = (lines: string[], name: string, rest: RegExp) => lines.some((l) => new RegExp(`^ {6}${name}:${rest.source}$`).test(l));
const valueless = /\s*$/;

describe('R1 prod compose passes the logo-scan variables', () => {
  const app = envLines('app');
  const ml = envLines('ml-service');

  it.each([
    'LOGO_PIPELINE_KEYS', 'LOGO_PIPELINE_KEYS_EXTRA', 'LOGO_SCAN_ROUTE',
    'LOGO_MODEL_VERSION', 'LOGO_SCAN_MAX_QUEUED', 'LOGO_SCAN_CONCURRENCY',
  ])('[P0] app passes %s without a value (unset stays unset, code default holds)', (name) => {
    expect(has(app, name, valueless)).toBe(true);
  });

  it('[P0] app LOGO_IMAGE_TAG follows RELEASE_SHA (the pinned release image)', () => {
    expect(has(app, 'LOGO_IMAGE_TAG', /\s*\$\{RELEASE_SHA:\?[^}]+\}/)).toBe(true);
  });

  it('[P0] app does not name SOURCE_COMMIT (Coolify-owned, could give a wrong code version)', () => {
    expect(compose).not.toMatch(/^\s+SOURCE_COMMIT\s*:/m);
  });

  it('[P0] ml-service passes NUTRISCORE_READER_MIN_RATIO without a value', () => {
    expect(has(ml, 'NUTRISCORE_READER_MIN_RATIO', valueless)).toBe(true);
  });

  it('[P0] no default interpolation and no env_file (production config checker forbids them)', () => {
    expect(compose).not.toMatch(/\$\{[A-Z0-9_]+:-/);
    expect(compose).not.toMatch(/^\s+env_file:/m);
  });

  it('[P1] drift: every LOGO_* the app source reads is passed by the app service', () => {
    const read = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); continue; }
        if (!/\.ts$/.test(e.name) || /\.test\.ts$/.test(e.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/process\.env(?:\.|\[')(LOGO_[A-Z0-9_]+)|envInt\('(LOGO_[A-Z0-9_]+)'/g)) read.add(m[1] ?? m[2]);
      }
    };
    walk(path.resolve(__dirname, '../..'));
    expect(read.size).toBeGreaterThan(5); // the scan itself works
    const passed = new Set(app.map((l) => l.trim().split(':')[0]));
    expect([...read].filter((n) => !passed.has(n))).toEqual([]);
  });
});
