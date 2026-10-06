/**
 * Verhaal 1.7 — meting van het effect van de zoekruimtebeperking (looptijd, aantal items, verschillen).
 * Draait NIET tegen echte omgevingen zonder `--bevestig`.
 * Gebruik: LOGO_SCAN_URL=... LOGO_SCAN_KEY=... tsx scripts/meet-zoekruimte.ts <beeldmap> <lijst.csv> <uitvoer-prefix> --bevestig
 * CSV: bestand,gpc (kop optioneel). Schrijft <uitvoer-prefix>.csv en .json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const [dir, csvPath, outPrefix] = args.filter((a) => !a.startsWith('--'));
if (!args.includes('--bevestig')) { console.error('Weigert te draaien zonder --bevestig (scant echte beelden tegen LOGO_SCAN_URL).'); process.exit(1); }
const base = process.env.LOGO_SCAN_URL, key = process.env.LOGO_SCAN_KEY;
if (!dir || !csvPath || !outPrefix || !base || !key) { console.error('Vereist: <beeldmap> <lijst.csv> <uitvoer-prefix> en LOGO_SCAN_URL + LOGO_SCAN_KEY.'); process.exit(1); }

const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
const DEADLINE_MS = 330000; // LOGO_SCAN_MAX_MS (300 s) + marge
const abort = () => AbortSignal.timeout(30000);
const host = new URL(base).host;
if (!/acc|stage|localhost|127\.0\.0\.1/i.test(host) && !args.includes('--ook-niet-acc')) {
  console.error(`Doelhost ${host} lijkt geen ACC/stage/lokaal; geef --ook-niet-acc om toch te meten.`); process.exit(1);
}
console.log(`Doel: ${host}`);

async function scan(file: string, gpc?: string) {
  const t = Date.now();
  const form = new FormData();
  form.append('file', new Blob([readFileSync(join(dir, file))]), basename(file));
  if (gpc) form.append('gpcCategoryCode', gpc);
  const post = await fetch(`${base}/api/v1/pipeline/logo-scans`, { method: 'POST', headers: { 'x-api-key': key! }, body: form, signal: abort() });
  if (post.status !== 202) throw new Error(`POST ${post.status}`);
  const { scanId } = (await post.json()) as { scanId: string };
  while (Date.now() - t < DEADLINE_MS) {
    const r = (await (await fetch(`${base}/api/v1/pipeline/logo-scans/${scanId}`, { headers: { 'x-api-key': key! }, signal: abort() })).json()) as any;
    if (r.status === 'done' || r.status === 'failed') {
      return {
        ms: Date.now() - t, status: r.status as string, beperkt: r.logoResults?.zoekruimte?.beperkt as boolean | undefined,
        items: (r.logoResults?.items ?? []).map((i: any) => i.soort as string).sort(),
      };
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  return { ms: Date.now() - t, status: 'client_timeout', beperkt: undefined, items: [] as string[] };
}

(async () => {
  // Laatste komma scheidt gpc van bestandsnaam, zodat een komma in de naam geen rij laat vallen.
  const all = readFileSync(csvPath, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.lastIndexOf(',');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string];
  });
  const rows = all.filter(([f, g]) => f && /^\d{8}$/.test(g));
  const overgeslagen = all.length - rows.length - (all[0] && !/^\d{8}$/.test(all[0][1]) ? 1 : 0); // de kopregel telt niet mee
  if (overgeslagen > 0) console.warn(`LET OP: ${overgeslagen} CSV-regel(s) overgeslagen (geen bestand,gpc met 8 cijfers).`);
  const out: any[] = [];
  const flush = () => {
    writeFileSync(`${outPrefix}.json`, JSON.stringify(out, null, 2));
    writeFileSync(`${outPrefix}.csv`, ['bestand,gpc,statusZonder,statusMet,beperkt,msZonder,msMet,itemsZonder,itemsMet,alleenZonder,alleenMet',
      ...out.map((r) => [q(r.file), r.gpc, r.statusZonder, r.statusMet, r.beperkt, r.msZonder, r.msMet, r.itemsZonder, r.itemsMet,
        q(r.alleenZonder.join('|')), q(r.alleenMet.join('|'))].join(','))].join('\n'));
  };
  for (const [file, gpc] of rows) {
    let zonder, met;
    try { zonder = await scan(file); met = await scan(file, gpc); } catch (e) {
      console.warn(`${file}: ${e instanceof Error ? e.message : 'fout'}`); continue; // per beeld; de rest van de meting blijft bewaard
    }
    out.push({
      file, gpc, statusZonder: zonder.status, statusMet: met.status, beperkt: met.beperkt, msZonder: zonder.ms, msMet: met.ms, itemsZonder: zonder.items.length, itemsMet: met.items.length,
      alleenZonder: zonder.items.filter((s) => !met.items.includes(s)), alleenMet: met.items.filter((s) => !zonder.items.includes(s)),
    });
    flush(); // per beeld bewaard: een storing later in de run kost geen eerdere metingen
  }
  flush();
  console.log(`${out.length} beelden gemeten`);
})();
