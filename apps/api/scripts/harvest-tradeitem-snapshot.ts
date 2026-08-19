/**
 * Story 20.19 — regenereert `src/services/tradeitem-declaration-snapshot.ts`.
 *
 * Eenmalig, HANDMATIG gestart, READ-ONLY. NOOIT automatisch bij deploy of migratie
 * (operationele envelope §3, ARCH-4). Governance-akkoord: 2026-07-04 (eenmalige,
 * handmatige leesactie) en 2026-08-19 (deze story; akkoordverzoek
 * `_bmad-output/planning-artifacts/akkoordverzoek-productie-leestoegang-2026-08-19.md`).
 *
 * WAAROM DIT SCRIPT IN `scripts/` STAAT EN NIET IN `src/`
 * De Dockerfile kopieert `apps/api/src/` en `apps/api/prisma/`, niet `apps/api/scripts/`
 * (Dockerfile:57-58). Dit script hoort de container dus NIET in te gaan — de applicatie
 * mag nooit zelf met de productiedatabase praten. Het gegenereerde bestand staat om
 * exact de omgekeerde reden wel onder `src/`.
 *
 * WAT HET DOET
 *   1. leest de declaratiecache van de doelomgeving en verzamelt de sleutels met
 *      reden `geen-tradeitem-bestand` (die groep, en alleen die groep);
 *   2. zoekt elk `{gln}-{gtin}-{tm}` op als `_id` in `application.tradeItems` — een
 *      exacte sleutelopzoeking van 0 ms, NOOIT een `$regex` of een zoekopdracht op
 *      `meta.gtin` (die is een collectiescan van ~51 s per aanroep);
 *   3. loopt elk document af op `meta.gdsn` en verzamelt de vijf keurmerkvelden,
 *      met dezelfde bewerkingen als `parseDeclaredMarks`: trim, uppercase,
 *      ontdubbeld per (fieldType, code), lege waarden overgeslagen, uitsluitend
 *      `value` (nooit `oldValue`), `enumerationValue` alleen binnen
 *      `consumerUsageLabelCode`;
 *   4. schrijft het TypeScript-bestand, inclusief de sleutels die niets declareren —
 *      een lege lijst betekent "gemeten, declareert niets", een ontbrekende sleutel
 *      betekent "niet gemeten".
 *
 * Verbindingsgegevens komen uit env (`TRADEITEMS_MONGO_URI`), nooit hardcoded of
 * gecommit. Gebruik een account met UITSLUITEND `read` op `application`. De driver
 * wordt lazy geimporteerd zodat `--dry-run` hem niet nodig heeft.
 *
 * Usage:
 *   # toont wat er geoogst zou worden, schrijft niets:
 *   TRADEITEMS_MONGO_URI=... REDIS_URL=... npx tsx scripts/harvest-tradeitem-snapshot.ts --dry-run
 *   # schrijft src/services/tradeitem-declaration-snapshot.ts:
 *   TRADEITEMS_MONGO_URI=... REDIS_URL=... npx tsx scripts/harvest-tradeitem-snapshot.ts --write
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { catalogEnvTag } from '../src/services/t3777-declarations';
import { createLogger } from '../src/core/logger';

const logger = createLogger('harvest-tradeitem-snapshot');

/**
 * gdsn-veldnaam -> canonieke `reference_logos.fieldType`. Gelijk aan MARK_FIELDS +
 * CONSUMER_USAGE_FIELD_TYPE in `src/services/t3777-declarations.ts`; wijkt dit af,
 * dan koppelen geoogste marks niet aan een logo.
 */
export const GDSN_TO_FIELD_TYPE: Readonly<Record<string, string>> = {
  packagingMarkedLabelAccreditationCode: 'PackagingMarkedLabelAccreditationCode',
  localPackagingMarkedLabelAccreditationCodeReference: 'AdditionalPackagingMarkingsCode',
  dietTypeCode: 'DietTypeCode',
  nutritionalScore: 'NutritionalScore',
  enumerationValue: 'EU_consumerUsageLabelCodeList',
};

/** Tekens die veilig als string-literal gerenderd kunnen worden. Zie L5 in extractMarks. */
const SAFE_CODE = /^[A-Z0-9_.-]+$/;

export interface HarvestedMark {
  fieldType: string;
  code: string;
}

/** Een trade-item-document, zoals het uit de database komt. */
export type TradeItemDocument = Record<string, unknown> & { _id: string };

/**
 * Haalt de keurmerken uit een document. Puur — geen I/O — zodat dit zonder database
 * te testen is; dat is de testnaad van AC10.
 */
export function extractMarks(doc: TradeItemDocument): HarvestedMark[] {
  const nodes: Array<Record<string, unknown>> = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const meta = record.meta;
    if (meta !== null && typeof meta === 'object') {
      const gdsn = (meta as Record<string, unknown>).gdsn;
      if (typeof gdsn === 'string' && gdsn in GDSN_TO_FIELD_TYPE) nodes.push(record);
    }
    for (const child of Object.values(record)) walk(child);
  };
  walk(doc);

  const seen = new Set<string>();
  const marks: HarvestedMark[] = [];
  for (const node of nodes) {
    const meta = node.meta as Record<string, unknown>;
    const gdsn = meta.gdsn as string;
    // `enumerationValue` is generiek in GDSN en botst met andere modules; net als
    // parseDeclaredMarks nemen we hem uitsluitend binnen consumerUsageLabelCode.
    if (gdsn === 'enumerationValue') {
      const xpath = typeof meta.xpath === 'string' ? meta.xpath : '';
      if (!xpath.includes('consumerUsageLabelCode')) continue;
    }
    // Uitsluitend `value`. `oldValue` is een vorige waarde en levert valse akkoorden
    // in de kruischeck op; het scheelt 17 instanties over 5 producten.
    const raw = node.value;
    if (typeof raw !== 'string') continue;
    const code = raw.trim().toUpperCase();
    if (!code) continue;
    // L5: de renderer zet codes in enkele aanhalingstekens zonder ontsnapping. Een
    // code met een apostrof of backslash zou een bestand opleveren dat niet
    // compileert. Vandaag is elke code [A-Z0-9_], maar dat afdwingen is goedkoper
    // dan erop hopen.
    if (!SAFE_CODE.test(code)) {
      throw new Error(
        `Code met een onveilig teken in ${doc._id}: ${JSON.stringify(code)}. ` +
          'Pas de renderer aan voordat je dit oogst.'
      );
    }
    const fieldType = GDSN_TO_FIELD_TYPE[gdsn];
    const pair = `${fieldType} ${code}`;
    if (seen.has(pair)) continue;
    seen.add(pair);
    marks.push({ fieldType, code });
  }
  marks.sort((a, b) => a.fieldType.localeCompare(b.fieldType) || a.code.localeCompare(b.code));
  return marks;
}

/** Deps die de orkestratie injecteert; tests geven mocks, een echte run de I/O. */
export interface HarvestDeps {
  /** Cachesleutels met reden `geen-tradeitem-bestand`, als `{gln}-{gtin}-{tm}`. */
  listMissingFileIds: () => Promise<string[]>;
  /** Documenten voor deze `_id`'s. Exacte sleutelopzoeking, nooit een scan. */
  fetchDocuments: (ids: string[]) => Promise<TradeItemDocument[]>;
}

export interface HarvestResult {
  snapshot: Record<string, HarvestedMark[]>;
  requested: number;
  found: number;
  withMarks: number;
  markInstances: number;
  instancesByFieldType: Record<string, number>;
  /**
   * De doelmarkt waar deze oogst over gaat. De sleutel eindigt erop, dus staat
   * `T3777_TARGET_MARKET` ooit op iets anders, dan mist ELKE opzoeking — zonder
   * foutmelding en zonder verschil met "niet gemeten". Daarom hoort hij in de meta.
   */
  targetMarket: string;
}

export async function harvest(deps: HarvestDeps): Promise<HarvestResult> {
  // Redis `SCAN` garandeert alleen dat elke sleutel MINSTENS een keer terugkomt.
  // Zonder ontdubbelen telt een dubbele sleutel twee keer mee in `withMarks` en
  // `markInstances`, terwijl `snapshot[id]` overschreven wordt — het bestand zou
  // dan zijn eigen consistentietoets laten vallen.
  const ids = [...new Set(await deps.listMissingFileIds())];
  const docs = await deps.fetchDocuments(ids);
  const byId = new Map(docs.map((d) => [d._id, d]));

  const snapshot: Record<string, HarvestedMark[]> = {};
  const instancesByFieldType: Record<string, number> = {};
  let withMarks = 0;
  let markInstances = 0;

  for (const id of ids) {
    const doc = byId.get(id);
    // Geen document = niet gemeten. Zo'n sleutel hoort NIET in de momentopname,
    // anders is straks niet te zien welke producten een verse oogst nodig hebben.
    if (!doc) continue;
    const marks = extractMarks(doc);
    snapshot[id] = marks;
    if (marks.length > 0) withMarks += 1;
    for (const mark of marks) {
      markInstances += 1;
      instancesByFieldType[mark.fieldType] = (instancesByFieldType[mark.fieldType] ?? 0) + 1;
    }
  }

  const targetMarkets = new Set(Object.keys(snapshot).map((id) => id.split('-')[2]));
  if (targetMarkets.size > 1) {
    throw new Error(
      `Oogst bevat meer dan een doelmarkt (${[...targetMarkets].join(', ')}). ` +
        'De momentopname is doelmarkt-gebonden; oogst er een per keer.'
    );
  }

  return {
    snapshot,
    requested: ids.length,
    found: byId.size,
    withMarks,
    markInstances,
    instancesByFieldType,
    targetMarket: [...targetMarkets][0] ?? '',
  };
}

/** Rendert het TypeScript-bestand. Puur, dus toetsbaar zonder schrijfrechten. */
export function renderSnapshotModule(result: HarvestResult, harvestedAt: string): string {
  const fieldTypes = Object.values(GDSN_TO_FIELD_TYPE);
  const counts = fieldTypes
    .map((ft) => `    ${ft}: ${result.instancesByFieldType[ft] ?? 0},`)
    .join('\n');
  const entries = Object.keys(result.snapshot)
    .sort()
    .map((id) => {
      const marks = result.snapshot[id];
      if (marks.length === 0) return `  '${id}': [],`;
      const body = marks
        .map((m) => `{ fieldType: '${m.fieldType}', code: '${m.code}' }`)
        .join(', ');
      return `  '${id}': [${body}],`;
    })
    .join('\n');

  return `/**
 * Momentopname van keurmerkdeclaraties uit de trade-item-database (story 20.19).
 *
 * GEGENEREERD BESTAND — niet met de hand bewerken.
 * Opnieuw genereren: \`apps/api/scripts/harvest-tradeitem-snapshot.ts\` (handmatig,
 * met een leesverbinding, nooit automatisch).
 *
 * Een lege lijst betekent "gemeten, declareert niets"; een ontbrekende sleutel
 * betekent "niet gemeten". Die twee mogen niet op een hoop.
 *
 * Bewerkingen bij het oogsten, gelijk aan \`parseDeclaredMarks\`: trim, uppercase,
 * ontdubbeld per (fieldType, code), lege waarden overgeslagen, uitsluitend \`value\`
 * (nooit \`oldValue\`), \`enumerationValue\` uitsluitend binnen \`consumerUsageLabelCode\`.
 *
 * Deze momentopname veroudert: producten die na de oogstdatum binnenkomen staan er
 * niet in. Loopt de beoordeelwachtrij opnieuw leeg, dan is opnieuw oogsten stap een.
 */

export interface SnapshotMark {
  /** Canonieke \`reference_logos.fieldType\`, gelijk aan MARK_FIELDS in t3777-declarations.ts. */
  fieldType: string;
  /** Declaratiecode, getrimd en in hoofdletters. */
  code: string;
}

export const TRADEITEM_SNAPSHOT_META = {
  harvestedAt: '${harvestedAt}',
  source: 'application.tradeItems (productie), opgezocht op _id = {gln}-{gtin}-{targetMarket}',
  targetMarket: '${result.targetMarket}',
  keys: ${Object.keys(result.snapshot).length},
  keysWithMarks: ${result.withMarks},
  markInstances: ${result.markInstances},
  instancesByFieldType: {
${counts}
  },
} as const;

/** Sleutel: \`{gln}-{gtin}-{targetMarket}\`, dezelfde vorm als \`_id\` in de database. */
export const TRADEITEM_SNAPSHOT: Readonly<Record<string, readonly SnapshotMark[]>> = {
${entries}
};
`;
}

/**
 * Haalt de gegenereerde tekst door prettier met de projectinstellingen, zodat het
 * bestand op schijf byte-voor-byte is wat de generator maakt. Zonder deze stap
 * herschrijft de opmaakstap het bestand alsnog en botst dat met de kopregel
 * "GEGENEREERD BESTAND — niet met de hand bewerken".
 */
export async function formatGenerated(source: string): Promise<string> {
  const prettier = await import('prettier');
  const config = (await prettier.resolveConfig(OUT_PATH)) ?? {};
  return prettier.format(source, {
    ...config,
    parser: 'typescript',
    singleQuote: true,
    printWidth: 100,
    trailingComma: 'es5',
  });
}

// ---------------------------------------------------------------------------
// Orkestratie — alleen bij directe uitvoering.
// ---------------------------------------------------------------------------

const OUT_PATH = join(__dirname, '..', 'src', 'services', 'tradeitem-declaration-snapshot.ts');

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  if (!write && !process.argv.includes('--dry-run')) {
    logger.error('Geef --dry-run of --write op.');
    process.exit(1);
  }

  const uri = process.env.TRADEITEMS_MONGO_URI;
  if (!uri) {
    logger.error('TRADEITEMS_MONGO_URI ontbreekt. Gebruik een account met uitsluitend `read`.');
    process.exit(1);
  }

  const { MongoClient } = await import('mongodb');
  const { default: Redis } = await import('ioredis');

  const redis = new Redis(process.env.REDIS_URL ?? process.env.REDIS_URI ?? '');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 15_000,
    maxPoolSize: 5,
  });

  try {
    await client.connect();
    const collection = client.db('application').collection('tradeItems');

    const deps: HarvestDeps = {
      listMissingFileIds: async () => {
        // M11: `marks:{env}:{gln}:{gtin}:{tm}` draagt een omgevingssegment. Delen twee
        // omgevingen ooit een Redis, dan oogst een blinde `marks:*`-scan ze door
        // elkaar. Filter dus op de omgeving die bij deze catalogus-basis hoort.
        const envTag = catalogEnvTag(
          (process.env.CATALOG_API_BASE || 'https://catalog.acc.xxtract.com').replace(/\/+$/, '')
        );
        logger.info(`Oogst uitsluitend cachesleutels van omgeving '${envTag}'.`);
        const ids: string[] = [];
        let cursor = '0';
        const keys: string[] = [];
        do {
          const [next, batch] = await redis.scan(
            cursor,
            'MATCH',
            `marks:${envTag}:*`,
            'COUNT',
            1000
          );
          cursor = next;
          keys.push(...batch);
        } while (cursor !== '0');
        for (let i = 0; i < keys.length; i += 200) {
          const chunk = keys.slice(i, i + 200);
          const values = await redis.mget(chunk);
          chunk.forEach((key, j) => {
            const raw = values[j];
            if (!raw) return;
            let parsed: { reason?: string };
            try {
              parsed = JSON.parse(raw) as { reason?: string };
            } catch {
              return;
            }
            if (parsed.reason !== 'geen-tradeitem-bestand') return;
            // marks:{env}:{gln}:{gtin}:{tm} -> {gln}-{gtin}-{tm}
            const parts = key.split(':');
            if (parts.length < 5 || parts[1] !== envTag) return;
            ids.push(`${parts[2]}-${parts[3]}-${parts[4]}`);
          });
        }
        return ids;
      },
      // Uitsluitend een exacte sleutelopzoeking. Geen $regex, geen meta.gtin.
      fetchDocuments: async (ids) =>
        (await collection.find({ _id: { $in: ids } }).toArray()) as unknown as TradeItemDocument[],
    };

    const result = await harvest(deps);
    logger.info(
      `Geoogst: ${result.found}/${result.requested} documenten, ${result.withMarks} met keurmerk, ` +
        `${result.markInstances} code-instanties.`
    );
    logger.info(`Per veldsoort: ${JSON.stringify(result.instancesByFieldType)}`);

    if (!write) {
      logger.info('--dry-run: er is niets geschreven.');
      return;
    }

    const harvestedAt = new Date().toISOString().slice(0, 10);
    // M2: door de uitvoer door dezelfde opmaakstap te halen die de repository ook
    // op de hand gebruikt, levert een tweede oogst hetzelfde bestand op in plaats
    // van een diff over alle 442 regels.
    const rendered = await formatGenerated(renderSnapshotModule(result, harvestedAt));
    writeFileSync(OUT_PATH, rendered, 'utf8');
    logger.info(`Geschreven: ${OUT_PATH}`);
  } finally {
    await client.close().catch(() => undefined);
    redis.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error(`Oogst mislukt: ${String(error)}`);
    process.exit(1);
  });
}
