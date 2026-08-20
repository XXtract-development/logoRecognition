/**
 * Declaratie-oogst-kaart — Story 20.20 (de declaratie-oogst weer aan de gang).
 *
 * Bouwt `flywheel-index/declared-harvest-map.json` — de code→GTIN-kaart die
 * `queue_harvest_declared.py` leest — uit de keurmerk→etiket-index
 * (`flywheel-index/keurmerk-etiket-index.json`, Story 19.3/19.19).
 *
 * WAAROM DIT SCRIPT BESTAAT: tot 20.20 bouwde NIETS die kaart. Hij was met de
 * hand gemaakt en stond daarom op 16 juli blijven staan (39 codes, 791
 * producten) terwijl de index doorgroeide naar 89 codes / 1082 producten. De
 * oogst las dus een bevroren afgeleide van een levende bron.
 *
 * Het naaste precedent is `build-nutriscore-declared-map.ts` (bouwt óók een
 * code→GTIN-kaart voor een oogst); de vorm en de scriptstijl (pure core,
 * injecteerbare deps, `require.main`-guard) komen van `build-keurmerk-index.ts`.
 *
 * MODUS — `--dry-run` IS DE STANDAARD; alleen `--apply` schrijft. Precedent:
 * `apps/api/scripts/backfill-gln-from-tradeitems.ts` en
 * `apps/ml-service/scripts/correct_nutriscore_labels.py` doen het allebei zo.
 * (De twee oudere index-scripts hebben het andersom — dry-run als vlag — maar
 * dit script schrijft de brandstof voor een run van uren, en dan hoort de
 * onschuldige stand de standaard te zijn.)
 *
 * LOKAAL (de bronbestanden staan er, tsx via npx):
 *
 *   DATABASE_URL=... npx tsx src/scripts/build-declared-harvest-map.ts            # droogloop
 *   DATABASE_URL=... npx tsx src/scripts/build-declared-harvest-map.ts --apply    # schrijft
 *   ... --apply --force                                                          # negeert de krimpgrens
 *
 * OP DE OMGEVING (in de api-container, via scripts/deployment/build-declared-harvest-map.sh):
 *
 *   node dist/scripts/build-declared-harvest-map.js --apply
 *
 * Het beeld bevat alleen `dist` — de runtime-laag van de root-Dockerfile kopieert
 * geen `src/` — en `tsx` staat in geen enkele package.json van deze repository.
 * `npx tsx src/...` kán daar dus niet draaien.
 *
 * EIGENAARSCHAP VAN BESTANDEN (AC5): dit script schrijft UITSLUITEND de kaart.
 * Het voortgangsbestand `keurmerk-harvest/declared-harvest-state.json` — met de
 * teller `next_offset` — is eigendom van de ml-service; die zet de teller zelf
 * terug zodra het aantal paren in de KAART verandert. Deze bouwer LEEST dat
 * bestand alleen om te melden wat er staat te gebeuren, en wacht nergens op.
 *
 * Dit bestand exporteert PURE helpers (geen I/O) zodat de unit-tests ze zonder
 * `main()` kunnen importeren.
 */

import prisma from "../core/db";
import {
  getStorageAdapter,
  BUCKETS,
  downloadTrainingObject,
} from "../services/storage";
import { createLogger } from "../core/logger";

const logger = createLogger("build-declared-harvest-map");

/** Vaste opslagsleutel van de kaart in de TRAINING-bucket — wat de oogst leest. */
export const DECLARED_HARVEST_MAP_OBJECT_KEY =
  "flywheel-index/declared-harvest-map.json";

/** De bronindex (Story 19.3) waaruit de kaart wordt afgeleid. */
export const SOURCE_INDEX_OBJECT_KEY =
  "flywheel-index/keurmerk-etiket-index.json";

/** Het voortgangsbestand van de oogst — alleen gelezen, nooit geschreven (AC5). */
export const HARVEST_STATE_OBJECT_KEY =
  "keurmerk-harvest/declared-harvest-state.json";

/**
 * Uitsluiting 1 — de veldsoort `NutritionalScore`. De indexsleutel geeft de kale
 * letters `A`..`E`, terwijl de referenties `NUTRISCORE_A`..`E` heten: de
 * gescopete zoektocht van de oogst levert daar per definitie niets op. En er
 * bestaat al een eigen Nutri-Score-oogst met een eigen markering, dus meedoen
 * zou dubbele items opleveren.
 */
export const EXCLUDED_FIELD_TYPES = new Set<string>(["NutritionalScore"]);

/**
 * Uitsluiting 3 — overstroming. Dezelfde twee die de volume-oogst uitsluit
 * (`queue_harvest.py`, `_DEFAULT_EXCLUDE_CODES`). Ze hébben allebei een actieve
 * referentie, dus geen van de andere twee uitsluitingen vangt ze.
 */
export const FLOOD_EXCLUDED_CODES = new Set<string>([
  "RECYCLABLE_GENERAL_CLAIM",
  "TRIMAN",
]);

/** Krimpgrens uit AC6: meer dan 10% minder paren dan de bestaande kaart blokkeert. */
export const SHRINK_TOLERANCE = 0.1;

// ---------------------------------------------------------------------------
// Datamodellen
// ---------------------------------------------------------------------------

/** Eén vermelding onder een indexsleutel (alleen `gtin` is hier nodig). */
export interface IndexLabelEntryLike {
  gtin: string;
  gln?: string;
  labels?: string[];
}

/** De vorm van de bronindex die deze bouwer gebruikt. */
export interface SourceIndexLike {
  builtAt?: string;
  entries: Record<string, IndexLabelEntryLike[]>;
  summary?: { distinctKeys?: number; gtinsWithData?: number };
}

/** Eén toegepaste uitsluiting: de reden, welke codes en hoeveel paren. */
export interface ExclusionRecord {
  reden: string;
  codes: string[];
  paren: number;
}

export interface DeclaredHarvestMap {
  builtAt: string;
  /** Herkomst: welke index, van wanneer, en hoe groot — zodat de kaart naspeurbaar is. */
  sourceIndex: {
    key: string;
    builtAt: string | null;
    distinctKeys: number | null;
    gtinsWithData: number | null;
  };
  /** De drie toegepaste uitsluitingen, elk mét de reden (AC2). */
  exclusions: {
    veldsoort: ExclusionRecord;
    zonderActieveReferentie: ExclusionRecord;
    overstroming: ExclusionRecord;
  };
  /**
   * Codes die alleen wachten op hun eerste actieve referentie. Aparte lijst,
   * zodat zichtbaar blijft wat er blijft liggen en waarom — de brug naar de
   * vervolgstory over die codes.
   */
  awaitingFirstReference: string[];
  /** De eigenlijke kaart: code → GTIN-lijst. Dit is wat de oogst leest. */
  codes: Record<string, string[]>;
  summary: { codes: number; products: number; pairs: number };
}

// ---------------------------------------------------------------------------
// PURE helpers (geen I/O)
// ---------------------------------------------------------------------------

/**
 * Splits een indexsleutel `<veldsoort>/<code>` op de EERSTE schuine streep.
 *
 * Bewust de eerste en niet de laatste: de veldsoort is het GS1-codelijstnaam-
 * deel en bevat nooit een streep, maar een code zou er in theorie wél een
 * kunnen dragen. Splitsen op de laatste streep zou dan een stuk veldsoort de
 * code in trekken en de code onvindbaar maken voor de referentiepool.
 */
export function splitIndexKey(key: string): {
  fieldType: string;
  code: string;
} {
  const i = key.indexOf("/");
  if (i < 0) return { fieldType: "", code: key.trim() };
  return { fieldType: key.slice(0, i).trim(), code: key.slice(i + 1).trim() };
}

/**
 * Bouw de kaart uit de index + de codes die vandaag minstens één ACTIEVE
 * referentie hebben.
 *
 * Volgorde van de uitsluitingen, en waarom:
 *   1. veldsoort `NutritionalScore` — vóór het samenvoegen, want dit is een
 *      oordeel over de SLEUTEL, niet over de code. Dezelfde code onder een
 *      andere veldsoort blijft dus gewoon staan.
 *   2. overstroming — vóór "zonder actieve referentie", want de overstroming is
 *      een absolute uitsluiting. Zou een overstromingscode ooit zijn referenties
 *      verliezen, dan hoort hij niet op de wachtlijst te verschijnen: dat zou
 *      beloven dat hij terugkomt zodra er een referentie is, en dat willen we
 *      juist niet. (Op de huidige index maakt de volgorde geen verschil —
 *      allebei de codes hébben een actieve referentie.)
 *   3. zonder actieve referentie — de oogst zoekt strikt binnen de eigen
 *      referentiepool van een code, dus zonder referentie levert het niets op.
 *
 * AC3 — botsende codes: dezelfde code kan onder MEERDERE veldsoorten in de index
 * staan (`PREGNANCY_WARNING` staat onder `EU_consumerUsageLabelCodeList` met 130
 * producten én onder `PackagingMarkedLabelAccreditationCode` met 2). De
 * productlijsten worden samengevoegd en ontdubbeld; naïef omzetten zou 130
 * producten weggooien voor 2.
 */
export function buildDeclaredHarvestMap(
  index: SourceIndexLike,
  activeReferenceCodes: Iterable<string>,
  now: Date = new Date(),
): DeclaredHarvestMap {
  // BEWUST GEEN toUpperCase op de referentiecodes. De kaart draagt hoofdletters
  // (`code.toUpperCase()` hieronder), en de oogst vergelijkt daarmee
  // HOOFDLETTERGEVOELIG: `rl.t3777_code = ANY($3::text[])` in
  // `find_similar_references_by_codes`. Een referentierij met een
  // niet-hoofdletter-code matcht daar dus nooit. Zou deze bouwer hem wél
  // meetellen als "heeft een actieve referentie", dan kwam de code in de kaart
  // en leverde hij per definitie stil nul matches op — precies de dure lege
  // ronde die deze story wegneemt. Door hier exact te vergelijken landt zo'n
  // code zichtbaar op de wachtlijst in plaats van onzichtbaar in de kaart.
  const active = new Set<string>();
  for (const c of activeReferenceCodes) {
    const t = (c ?? "").trim();
    if (t) active.add(t);
  }

  const veldsoortCodes = new Set<string>();
  // Per code de GTIN's die via een UITGESLOTEN veldsoort binnenkwamen. Pas ná
  // het samenvoegen is te zeggen hoeveel paren er werkelijk wegvallen: staat
  // dezelfde code óók onder een andere veldsoort, dan blijft het paar gewoon in
  // de kaart en is het geen uitsluiting. Naïef optellen tijdens de lus telde die
  // paren twee keer — onschuldig in de kaart zelf, misleidend als getal in een
  // rapportage.
  const veldsoortByCode = new Map<string, Set<string>>();

  // code → GTIN-verzameling, samengevoegd over veldsoorten heen (AC3).
  const byCode = new Map<string, Set<string>>();

  for (const [key, vermeldingen] of Object.entries(index.entries ?? {})) {
    const { fieldType, code } = splitIndexKey(key);
    const codeU = code.toUpperCase();
    if (!codeU) continue;

    const gtins = new Set<string>();
    for (const v of vermeldingen ?? []) {
      const g = (v?.gtin ?? "").trim();
      if (g) gtins.add(g);
    }
    if (gtins.size === 0) continue;

    if (EXCLUDED_FIELD_TYPES.has(fieldType)) {
      veldsoortCodes.add(codeU);
      let uitgesloten = veldsoortByCode.get(codeU);
      if (!uitgesloten) {
        uitgesloten = new Set<string>();
        veldsoortByCode.set(codeU, uitgesloten);
      }
      for (const g of gtins) uitgesloten.add(g);
      continue;
    }

    let bestaand = byCode.get(codeU);
    if (!bestaand) {
      bestaand = new Set<string>();
      byCode.set(codeU, bestaand);
    }
    for (const g of gtins) bestaand.add(g);
  }

  // Tel per uitgesloten veldsoort-sleutel alleen de paren die er ECHT uitvallen:
  // een GTIN die voor dezelfde code ook onder een toegelaten veldsoort staat,
  // blijft in de kaart en is dus niet uitgesloten.
  let veldsoortParen = 0;
  for (const [codeU, uitgesloten] of veldsoortByCode) {
    const behouden = byCode.get(codeU);
    for (const g of uitgesloten) {
      if (!behouden || !behouden.has(g)) veldsoortParen += 1;
    }
  }

  const overstromingCodes: string[] = [];
  let overstromingParen = 0;
  const zonderRefCodes: string[] = [];
  let zonderRefParen = 0;
  const codes: Record<string, string[]> = {};
  const producten = new Set<string>();
  let paren = 0;

  for (const codeU of [...byCode.keys()].sort()) {
    const gtins = byCode.get(codeU)!;
    if (FLOOD_EXCLUDED_CODES.has(codeU)) {
      overstromingCodes.push(codeU);
      overstromingParen += gtins.size;
      continue;
    }
    if (!active.has(codeU)) {
      zonderRefCodes.push(codeU);
      zonderRefParen += gtins.size;
      continue;
    }
    const lijst = [...gtins].sort();
    codes[codeU] = lijst;
    for (const g of lijst) producten.add(g);
    paren += lijst.length;
  }

  return {
    builtAt: now.toISOString(),
    sourceIndex: {
      key: SOURCE_INDEX_OBJECT_KEY,
      builtAt: index.builtAt ?? null,
      distinctKeys: index.summary?.distinctKeys ?? null,
      gtinsWithData: index.summary?.gtinsWithData ?? null,
    },
    exclusions: {
      veldsoort: {
        reden:
          "veldsoort NutritionalScore: de sleutel geeft A..E terwijl de referenties " +
          "NUTRISCORE_A..E heten, en de eigen Nutri-Score-oogst zou dubbele items opleveren",
        codes: [...veldsoortCodes].sort(),
        paren: veldsoortParen,
      },
      zonderActieveReferentie: {
        reden:
          "de oogst zoekt strikt binnen de eigen referentiepool van een code; " +
          "zonder actieve referentie levert dat per definitie niets op. De " +
          "vergelijking is HOOFDLETTERGEVOELIG, net als de matchquery van de " +
          "oogst: een referentiecode met een andere schrijfwijze telt hier " +
          "bewust niet mee, want hij zou daar ook nooit matchen",
        codes: zonderRefCodes,
        paren: zonderRefParen,
      },
      overstroming: {
        reden:
          "overstroming — dezelfde twee codes die de volume-oogst uitsluit " +
          "(queue_harvest.py, _DEFAULT_EXCLUDE_CODES)",
        codes: overstromingCodes,
        paren: overstromingParen,
      },
    },
    awaitingFirstReference: [...zonderRefCodes],
    codes,
    summary: {
      codes: Object.keys(codes).length,
      products: producten.size,
      pairs: paren,
    },
  };
}

/** Serialiseer deterministisch (codes al gesorteerd opgebouwd) voor idempotente opslag. */
export function serializeDeclaredHarvestMap(map: DeclaredHarvestMap): string {
  return JSON.stringify(map, null, 2);
}

export interface ShrinkVerdict {
  blocked: boolean;
  /** De gemeten krimp als fractie, of `null` als er niets te vergelijken viel. */
  shrinkPct: number | null;
  message: string | null;
}

/**
 * AC6 — krimpbescherming met een getal.
 *
 * De index kapt standaard af op 500 GTINs (`KEURMERK_INDEX_LIMIT`) van de 1862.
 * Een index die per ongeluk met die standaard is gebouwd zou de kaart
 * stilzwijgend uitkleden tot een kwart. Meer dan 10% minder paren dan de
 * bestaande kaart blokkeert het schrijven; `--force` overschrijft dat bewust.
 *
 * Twee gevallen die er expliciet bij horen: is er nog geen kaart (of had die
 * nul paren), dan blokkeert de bescherming niet — dat is de eerste run. En de
 * melding wordt ook in een droogloop afgegeven, anders ontdek je de blokkade
 * pas bij het schrijven.
 *
 * Bewust twee TELLINGEN als invoer, geen kaarten: zo is de grens toetsbaar
 * zonder dat er een echte kaart aan te pas komt.
 */
export function evaluateShrink(args: {
  freshPairs: number;
  existingPairs: number | null;
  force: boolean;
}): ShrinkVerdict {
  const { freshPairs, existingPairs, force } = args;
  if (existingPairs === null || existingPairs <= 0) {
    return { blocked: false, shrinkPct: null, message: null };
  }
  const shrinkPct = (existingPairs - freshPairs) / existingPairs;
  if (shrinkPct <= SHRINK_TOLERANCE) {
    return { blocked: false, shrinkPct, message: null };
  }
  const pct = (shrinkPct * 100).toFixed(1);
  const message =
    `krimp: ${freshPairs} paren tegenover ${existingPairs} in de bestaande kaart ` +
    `(${pct}% kleiner, grens ${(SHRINK_TOLERANCE * 100).toFixed(0)}%)` +
    (force
      ? " — bewust doorgezet met --force"
      : " — gebruik --force om dit bewust door te zetten");
  return { blocked: !force, shrinkPct, message };
}

export interface CounterPlan {
  reset: boolean;
  message: string;
}

/**
 * AC5 — wat er met de teller van de oogst gebeurt zodra deze kaart landt.
 *
 * "De parenlijst verandert" wordt vastgesteld op de paren in de KAART, niet op
 * de door artwork gefilterde paren: die tweede hangt af van wat er die nacht in
 * de opslag staat en zou de teller om niets laten terugspringen.
 *
 * De bouwer ZET de teller niet terug — dat doet de ml-service, die eigenaar is
 * van het voortgangsbestand. Deze functie beschrijft alleen wat er staat te
 * gebeuren. Loopt er een run, dan blijft de teller staan en meldt de bouwer dat;
 * hij wacht niet.
 */
export function describeCounterPlan(args: {
  mapPairs: number;
  statePairs: number | null;
  inProgress: boolean;
}): CounterPlan {
  const { mapPairs, statePairs, inProgress } = args;
  if (statePairs === null) {
    return {
      reset: false,
      message:
        "het voortgangsbestand draagt nog geen parenaantal — de oogst legt het bij " +
        "zijn eerstvolgende start vast; de teller wordt nu niet teruggezet",
    };
  }
  if (statePairs === mapPairs) {
    return {
      reset: false,
      message: `de kaart houdt ${mapPairs} paren — de teller blijft staan`,
    };
  }
  if (inProgress) {
    return {
      reset: false,
      message:
        `er loopt een oogstrun; de teller wordt NIET teruggezet (${statePairs} → ${mapPairs} paren). ` +
        "De bouwer wacht niet — herhaal deze melding na afloop van die run.",
    };
  }
  return {
    reset: true,
    message:
      `de kaart gaat van ${statePairs} naar ${mapPairs} paren — de oogst zet zijn teller ` +
      "bij de eerstvolgende start terug naar 0",
  };
}

// ---------------------------------------------------------------------------
// I/O-laag (alleen gebruikt door de CLI-entrypoint; nooit in tests)
// ---------------------------------------------------------------------------

export interface DeclaredHarvestMapDeps {
  /** De bronindex, of `null` als hij ontbreekt/onleesbaar is. */
  readIndex: () => Promise<SourceIndexLike | null>;
  /** Codes met minstens één ACTIEVE referentie. */
  listActiveReferenceCodes: () => Promise<string[]>;
  /** Het aantal paren in de bestaande kaart, of `null` als er geen kaart is. */
  readExistingPairs: () => Promise<number | null>;
  /** `{pairs, inProgress}` uit het voortgangsbestand van de oogst (alleen lezen). */
  readHarvestState: () => Promise<{
    pairs: number | null;
    inProgress: boolean;
  }>;
  /** Schrijf de kaart (alleen aangeroepen bij `--apply` en een doorlaatbare poort). */
  writeMap: (body: Buffer) => Promise<void>;
}

async function readSourceIndex(): Promise<SourceIndexLike | null> {
  const buf = await downloadTrainingObject(SOURCE_INDEX_OBJECT_KEY);
  if (!buf) return null;
  try {
    const parsed = JSON.parse(buf.toString("utf8")) as SourceIndexLike;
    return parsed && typeof parsed === "object" && parsed.entries
      ? parsed
      : null;
  } catch {
    return null;
  }
}

async function listActiveReferenceCodes(): Promise<string[]> {
  const rows = await prisma.referenceLogo.findMany({
    where: { active: true },
    distinct: ["t3777Code"],
    select: { t3777Code: true },
    orderBy: { t3777Code: "asc" },
  });
  return rows.map((r) => r.t3777Code);
}

async function readExistingPairs(): Promise<number | null> {
  try {
    const buf = await downloadTrainingObject(DECLARED_HARVEST_MAP_OBJECT_KEY);
    if (!buf) return null;
    const parsed = JSON.parse(buf.toString("utf8")) as {
      codes?: Record<string, string[]>;
    };
    const codes = parsed?.codes;
    if (!codes || typeof codes !== "object") return null;
    return Object.values(codes).reduce(
      (n, list) => n + (Array.isArray(list) ? list.length : 0),
      0,
    );
  } catch {
    return null;
  }
}

async function readHarvestState(): Promise<{
  pairs: number | null;
  inProgress: boolean;
}> {
  try {
    const buf = await downloadTrainingObject(HARVEST_STATE_OBJECT_KEY);
    if (!buf) return { pairs: null, inProgress: false };
    const parsed = JSON.parse(buf.toString("utf8")) as {
      map_pairs?: number;
      in_progress?: boolean;
    };
    return {
      pairs: typeof parsed?.map_pairs === "number" ? parsed.map_pairs : null,
      inProgress: Boolean(parsed?.in_progress),
    };
  } catch {
    return { pairs: null, inProgress: false };
  }
}

async function writeMap(body: Buffer): Promise<void> {
  const adapter = getStorageAdapter();
  await adapter.putObject(
    BUCKETS.TRAINING,
    DECLARED_HARVEST_MAP_OBJECT_KEY,
    body,
    body.length,
    {
      "Content-Type": "application/json",
    },
  );
  logger.info("Declaratie-oogst-kaart weggeschreven", {
    bucket: BUCKETS.TRAINING,
    key: DECLARED_HARVEST_MAP_OBJECT_KEY,
    bytes: body.length,
  });
}

function createProdDeps(): DeclaredHarvestMapDeps {
  return {
    readIndex: readSourceIndex,
    listActiveReferenceCodes,
    readExistingPairs,
    readHarvestState,
    writeMap,
  };
}

function printPlan(map: DeclaredHarvestMap, apply: boolean): void {
  /* eslint-disable no-console */
  console.log("=== Declaratie-oogst-kaart ===");
  console.log(
    `  Modus              : ${apply ? "ECHTE BOUW (--apply)" : "DROGE RUN (schrijft niets)"}`,
  );
  console.log(
    `  Bronindex          : ${map.sourceIndex.key} (gebouwd ${map.sourceIndex.builtAt ?? "onbekend"})`,
  );
  console.log(
    `  Bronomvang         : ${map.sourceIndex.distinctKeys ?? "?"} sleutels, ` +
      `${map.sourceIndex.gtinsWithData ?? "?"} GTINs met data`,
  );
  console.log("  Uitsluitingen      :");
  for (const [naam, rec] of Object.entries(map.exclusions)) {
    console.log(
      `    ${naam.padEnd(26)} ${rec.codes.length} code(s), ${rec.paren} paar/paren`,
    );
    console.log(`      reden: ${rec.reden}`);
  }
  console.log(
    `  Wacht op referentie: ${map.awaitingFirstReference.length} code(s)`,
  );
  console.log(
    `  Kaart              : ${map.summary.codes} codes, ${map.summary.products} producten, ` +
      `${map.summary.pairs} paren`,
  );
  /* eslint-enable no-console */
}

export async function runBuild(
  deps: DeclaredHarvestMapDeps,
  opts: { apply: boolean; force: boolean },
  now: Date = new Date(),
): Promise<number> {
  const index = await deps.readIndex();
  if (!index) {
    // eslint-disable-next-line no-console
    console.error(
      `Bronindex ${SOURCE_INDEX_OBJECT_KEY} ontbreekt of is onleesbaar — geen kaart gebouwd.`,
    );
    return 1;
  }

  const activeCodes = await deps.listActiveReferenceCodes();
  const map = buildDeclaredHarvestMap(index, activeCodes, now);
  printPlan(map, opts.apply);

  const existingPairs = await deps.readExistingPairs();
  const shrink = evaluateShrink({
    freshPairs: map.summary.pairs,
    existingPairs,
    force: opts.force,
  });
  /* eslint-disable no-console */
  if (existingPairs === null) {
    console.log(
      "  Krimpbescherming   : geen leesbare bestaande kaart — niet van toepassing (eerste run).",
    );
  } else if (shrink.message) {
    console.log(`  Krimpbescherming   : ${shrink.message}`);
  } else {
    console.log(
      `  Krimpbescherming   : ${map.summary.pairs} paren tegenover ${existingPairs} — binnen de grens.`,
    );
  }

  const state = await deps.readHarvestState();
  const plan = describeCounterPlan({
    mapPairs: map.summary.pairs,
    statePairs: state.pairs,
    inProgress: state.inProgress,
  });
  console.log(`  Teller van de oogst: ${plan.message}`);

  // De droogloop MELDT de blokkade, maar rapporteert geen mislukking. Een run
  // die per definitie niets schrijft is niet kapot omdat het schrijven zou zijn
  // tegengehouden; exitcode 1 leest in een cron-keten of in CI als "stuk" en dat
  // is precies de verkeerde melding. Vandaar dat de droogloop-tak vóór de
  // blokkade-tak staat.
  if (!opts.apply) {
    /* eslint-enable no-console */
    // eslint-disable-next-line no-console
    console.log(
      shrink.blocked
        ? "Droge run — er is niets naar de opslag geschreven. LET OP: met --apply zou de " +
            "krimpbescherming dit schrijven blokkeren; bewust doorzetten kan met --force."
        : "Droge run — er is niets naar de opslag geschreven. Schrijven doe je met --apply.",
    );
    return 0;
  }

  /* eslint-disable no-console */
  if (shrink.blocked) {
    console.error(
      "KRIMPBESCHERMING BLOKKEERT — de bestaande kaart blijft ongewijzigd.",
    );
    console.error("  Bewust doorzetten kan met --force.");
    /* eslint-enable no-console */
    return 1;
  }

  await deps.writeMap(Buffer.from(serializeDeclaredHarvestMap(map), "utf-8"));
  // eslint-disable-next-line no-console
  console.log(
    `Kaart gebouwd: ${map.summary.codes} codes, ${map.summary.pairs} paren → ${DECLARED_HARVEST_MAP_OBJECT_KEY}`,
  );
  return 0;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  process.exitCode = await runBuild(createProdDeps(), { apply, force });
}

// require.main-guard: importeren van dit bestand (in tests) draait main() NIET.
if (require.main === module) {
  main()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Declaratie-oogst-kaart-bouw faalde:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
