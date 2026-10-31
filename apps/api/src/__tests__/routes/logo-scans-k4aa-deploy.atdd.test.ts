// spec-logo-scan-k4aa CAP-9 — ATDD (written before the change): ACC ml-service gets 12G, production stays as it is.
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../../..');
const mlBlock = (file: string) => {
  const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const m = text.match(/^ {2}ml-service:\n([\s\S]*?)(?=^ {2}\S|^\S|(?![\s\S]))/m);
  return m ? m[1] : '';
};

describe('CAP-9 ml-service memory for the K4-aa trials', () => {
  it('[P1] docker-compose.acc.yml: ml-service limit is 12G, reservation stays 2G', () => {
    const b = mlBlock('docker-compose.acc.yml');
    const limits = b.match(/limits:\n(?: {10}\w+:.*\n)*? {10}memory: *(\S+)/);
    const reservations = b.match(/reservations:\n(?: {10}\w+:.*\n)*? {10}memory: *(\S+)/);
    expect(limits?.[1]).toBe('12G');
    expect(reservations?.[1]).toBe('2G');
  });
  it('[P1] docker-compose.prod.yml: ml-service limit stays 8G', () => {
    expect(mlBlock('docker-compose.prod.yml')).toMatch(/limits: \{cpus: '4\.0', memory: 8G\}/);
  });
});
