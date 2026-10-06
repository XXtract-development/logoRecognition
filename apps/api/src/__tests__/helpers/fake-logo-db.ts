// In-memory stand-in for prisma.logoScan / prisma.logoCurrentImage (Story 1.3). Tests never touch a real database.
type Row = Record<string, any>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(v);
      if ('not' in cond) return v !== cond.not;
      if ('lt' in cond && !(v < cond.lt)) return false;
      if ('lte' in cond && !(v <= cond.lte)) return false;
      if ('gt' in cond && !(v > cond.gt)) return false;
      if ('gte' in cond && !(v >= cond.gte)) return false;
      return true;
    }
    return (v ?? null) === (cond ?? null) || (v instanceof Date && cond instanceof Date && +v === +cond);
  });
}

export function makeFakeLogoDb() {
  const scans: Row[] = [];
  const current: Row[] = [];
  const state = { missingTable: false, calls: [] as string[] };
  const guard = (name: string) => {
    state.calls.push(name);
    if (state.missingTable) throw Object.assign(new Error('The table `public.logo_scans` does not exist in the current database.'), { code: 'P2021' });
  };
  const sortDesc = (rows: Row[], orderBy?: Row) => {
    const [key, dir] = Object.entries(orderBy ?? {})[0] ?? [];
    return key ? [...rows].sort((a, b) => (dir === 'desc' ? -1 : 1) * (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0)) : rows;
  };
  const uniqueKey = (r: Row) => [r.productId, r.imageHash, r.modelVersion, r.referenceVersion, r.attempt].join('|');
  const logoScan = {
    async create({ data }: { data: Row }) {
      guard('logoScan.create');
      if (data.productId != null && scans.some(r => uniqueKey(r) === uniqueKey(data))) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      const row = { createdAt: new Date(), requestedAt: new Date(), ...data };
      scans.push(row); return row;
    },
    async findFirst({ where, orderBy }: { where?: Row; orderBy?: Row }) { guard('logoScan.findFirst'); return sortDesc(scans.filter(r => matches(r, where)), orderBy)[0] ?? null; },
    async findUnique({ where }: { where: Row }) { guard('logoScan.findUnique'); return scans.find(r => matches(r, where)) ?? null; },
    async updateMany({ where, data }: { where?: Row; data: Row }) {
      guard('logoScan.updateMany');
      const hit = scans.filter(r => matches(r, where)); hit.forEach(r => Object.assign(r, data)); return { count: hit.length };
    },
    async deleteMany({ where }: { where?: Row }) {
      guard('logoScan.deleteMany');
      const keep = scans.filter(r => !matches(r, where)); const count = scans.length - keep.length;
      scans.splice(0, scans.length, ...keep); return { count };
    },
  };
  const logoCurrentImage = {
    async findUnique({ where }: { where: Row }) { guard('logoCurrentImage.findUnique'); return current.find(r => matches(r, where)) ?? null; },
    async create({ data }: { data: Row }) {
      guard('logoCurrentImage.create');
      if (current.some(r => r.productId === data.productId)) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      current.push({ ...data }); return data;
    },
    async deleteMany({ where }: { where?: Row }) {
      guard('logoCurrentImage.deleteMany');
      const keep = current.filter(r => !matches(r, where)); const count = current.length - keep.length;
      current.splice(0, current.length, ...keep); return { count };
    },
    async updateMany({ where, data }: { where?: Row; data: Row }) {
      guard('logoCurrentImage.updateMany');
      const hit = current.filter(r => matches(r, where)); hit.forEach(r => Object.assign(r, data)); return { count: hit.length };
    },
  };
  return { scans, current, state, logoScan, logoCurrentImage };
}
