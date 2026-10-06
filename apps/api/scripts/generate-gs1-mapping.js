/**
 * Verhaal 1.4 — genereert src/services/gs1-mapping.json (omzettabel soort -> GS1-veld/waarde + opnamestand).
 * Gebruik: node scripts/generate-gs1-mapping.js   (deterministisch: zelfde bronnen = byte-gelijk bestand)
 *
 * Bronnen:
 *  - src/services/reference-code-mapping.json   categorieën (dieet, GHS, gebruikslabel, Nutri-Score)
 *  - ../web/src/data/keurmerk-codes.ts          T3777-keurmerkcodes
 *  - scripts/gs1-mapping-sources/logodekking-2026-10-02-actieve-codes.json   61 codes met actieve referenties
 *  - scripts/gs1-mapping-sources/gs1-not-in-codelist-31371.json              52 keurmerkcodes die niet in GS1 3.1.37.1 staan
 * De startstand is nooit `automatisch`; naar `automatisch` gaat een soort pas na een meetrapport (verhaal 5.4).
 */
const fs = require('fs');
const path = require('path');

const API = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.resolve(API, p), 'utf8');
const mapping = JSON.parse(read('src/services/reference-code-mapping.json'));
const codesOf = (p) => {
  const c = JSON.parse(read(p)).codes;
  if (!Array.isArray(c) || c.length === 0) throw new Error(`bron ${p} mist een niet-lege "codes"-lijst`);
  return new Set(c);
};
const active = codesOf('scripts/gs1-mapping-sources/logodekking-2026-10-02-actieve-codes.json');
const notInGs1 = codesOf('scripts/gs1-mapping-sources/gs1-not-in-codelist-31371.json');
// Standwijzigingen (bv. naar `automatisch` na een meetrapport, verhaal 5.4) horen HIER, nooit met de hand in het JSON:
// { "SOORT": { "opnamestand": "...", "rapportverwijzing": "...", "validForModelVersion": "...", "validForReferenceVersion": "...", "besluitdatum": "YYYY-MM-DD" } }
const overrides = JSON.parse(read('scripts/gs1-mapping-sources/stand-overrides.json'));
// GPC-prefixen per categorie (2/4/6/8 cijfers); alleen invullen wat zeker is (zie README). Leeg = overal.
const catOverrides = JSON.parse(read('scripts/gs1-mapping-sources/categorieen-overrides.json'));
const t3777 = [...read('../web/src/data/keurmerk-codes.ts').matchAll(/^"([^"]*)",?\s*$/gm)].map((m) => m[1]);
if (t3777.length !== 889) throw new Error(`keurmerk-codes.ts levert ${t3777.length} codes, verwacht 889 (regex of bestand gewijzigd?)`);

const BESLUITDATUM = '2026-10-06';
const MODULE_PAD = {
  DietTypeCode: ['dietInformationModule', 'dietInformation/dietTypeInformation'],
  GHSSymbolDescriptionCode: ['safetyDataSheetModule', 'safetyDataSheetInformation/gHSDetail'],
  EU_consumerUsageLabelCodeList: ['consumerInstructionsModule', 'consumerInstructions/consumerUsageLabelCode/enumerationValueInformation'],
  NutritionalScore: ['healthRelatedInformationModule', 'healthRelatedInformation/nutritionalProgram'],
  T3777: ['packagingMarkingModule', 'packagingMarking'],
};

function gs1For(category, code) {
  const [module, pad] = MODULE_PAD[category];
  const g = (veld, waarde, groep) => ({ module, pad, veld, waarde, ...(groep ? { groep } : {}) });
  switch (category) {
    case 'DietTypeCode': return [g('dietTypeCode', code, `dietType-${code}`), g('isDietTypeMarkedOnPackage', 'true', `dietType-${code}`)];
    case 'GHSSymbolDescriptionCode': return [g('gHSSymbolDescriptionCode', code)];
    case 'EU_consumerUsageLabelCodeList': return [g('enumerationValue', code)];
    // programCode 8 = Nutri-Score; VERIFIED in 10 regressiefixtures (q4-q5-q7-uitkomst.md)
    case 'NutritionalScore': return [g('nutritionalScore', code.slice(-1), 'nutritionalProgram'), g('nutritionalProgramCode', '8', 'nutritionalProgram')];
    default: return [g('packagingMarkedLabelAccreditationCode', code)];
  }
}

function stand(category, code) {
  if (notInGs1.has(code)) return { s: 'uit', reden: 'niet in GS1-codelijst 3.1.37.1', bron: 'q4-q5-q7-uitkomst.md (Q5)' };
  // ponytail: GHS krijgt voorstel omdat de GHS-specialist al live is; de code zet het plafond toch op voorstel.
  if (category === 'GHSSymbolDescriptionCode') return { s: 'voorstel', bron: 'GHS-specialist; plafond voorstel in code' };
  if (active.has(code)) return { s: 'voorstel', bron: 'logodekking-2026-10-02 (actieve referenties)' };
  return { s: 'uit', reden: 'geen actieve referenties', bron: 'logodekking-2026-10-02' };
}

const seen = new Map();
const categoryOf = new Map();
const uitgesloten = [];
const add = (category, code) => {
  if (seen.has(code)) {
    // Dubbele soort: de specifieke codelijst wint van de generieke T3777-lijst (zelfde regel als resolveFieldType);
    // twee verschillende specifieke lijsten is een conflict.
    if (category !== 'T3777' && categoryOf.get(code) !== category) throw new Error(`soort ${code} staat in twee categorieën`);
    return;
  }
  categoryOf.set(code, category);
  if (code === 'NO_PICTOGRAM') return uitgesloten.push({ soort: code, reden: 'geen positieve GHS-klasse (assertPositiveReferenceCode)' });
  if (/\s/.test(code)) return uitgesloten.push({ soort: code, reden: 'ongeldige code (spatie), vermoedelijk verkeerd gespeld; niet in GS1-lijst' });
  const st = stand(category, code);
  seen.set(code, {
    soort: code,
    gs1: gs1For(category, code),
    categorieen: [],
    opnamestand: st.s,
    startstand: st.s,
    ...(st.reden ? { reden: st.reden } : {}),
    bron: st.bron,
    validForModelVersion: null,
    validForReferenceVersion: null,
    besluitdatum: BESLUITDATUM,
    rapportverwijzing: null,
  });
};
for (const [category, group] of Object.entries(mapping.categories)) group.codes.forEach((c) => add(category, c));
t3777.forEach((c) => add('T3777', c));
// Soorten met actieve referenties die niet in de lokale keurmerklijst staan (bv. SOCIETY_PLASTICS_INDUSTRY): T3777.
[...active].sort().forEach((c) => add('T3777', c));

for (const [soort, o] of Object.entries(overrides)) {
  const e = seen.get(soort);
  if (!e) throw new Error(`override voor onbekende soort ${soort}`);
  Object.assign(e, o);
}
for (const [cat, prefixes] of Object.entries(catOverrides)) {
  if (!Object.keys(MODULE_PAD).includes(cat)) throw new Error(`categorieen-override voor onbekende categorie ${cat}`);
  if (!Array.isArray(prefixes) || prefixes.some((p) => !/^(\d{2}|\d{4}|\d{6}|\d{8})$/.test(p))) throw new Error(`categorieen-override ${cat}: ongeldige prefix (2/4/6/8 cijfers)`);
  for (const [code, c] of categoryOf) if (c === cat && seen.has(code)) seen.get(code).categorieen = [...prefixes];
}
const entries = [...seen.values()].sort((a, b) => (a.soort < b.soort ? -1 : 1));
uitgesloten.sort((a, b) => (a.soort < b.soort ? -1 : 1));
const out =
  '{\n  "schemaVersion": 1,\n  "gegenereerdDoor": "apps/api/scripts/generate-gs1-mapping.js",\n  "entries": [\n' +
  entries.map((e) => '    ' + JSON.stringify(e)).join(',\n') +
  '\n  ],\n  "uitgesloten": [\n' +
  uitgesloten.map((e) => '    ' + JSON.stringify(e)).join(',\n') +
  '\n  ]\n}\n';
module.exports = { text: out };
if (require.main === module) {
  fs.writeFileSync(path.resolve(API, 'src/services/gs1-mapping.json'), out);
  console.log(`${entries.length} regels, ${uitgesloten.length} uitgesloten`);
}
