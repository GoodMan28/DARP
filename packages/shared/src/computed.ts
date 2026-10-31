/*
 * Fields worked out from other fields, so nobody types what the system already knows. The value is
 * still stored and exported: IQAC's sheets ask for it. One function, used by the server (which decides)
 * and by the form (which shows it live).
 */
export type ComputedRule =
  | { kind: 'daysInclusive'; from: string; to: string }
  | { kind: 'copy'; from: string }
  | { kind: 'yearOf'; from: string }
  | { kind: 'lineCount'; from: string }
  | { kind: 'join'; from: string[]; separator: string }
  | { kind: 'listParent'; from: string }
  | { kind: 'instituteCountry'; from: string }
  | { kind: 'account'; key: 'name' | 'dateOfJoining' };

export interface ComputeContext {
  account?: { name: string; dateOfJoining: string | null };
  /** code → country, for the institutes on this record. */
  institutes?: Map<string, { country: string }>;
  /** A dropdown value → its parent: M.Tech. → PG. */
  parents?: Record<string, string>;
}

const dayNumber = (v: unknown): number | null => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : null;
};
const text = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

/** The rule's value, or undefined to leave what is there (nothing to work it out from). */
export function computeValue(rule: ComputedRule, v: Record<string, unknown>, ctx: ComputeContext = {}): string | undefined {
  switch (rule.kind) {
    case 'daysInclusive': {
      const a = dayNumber(v[rule.from]);
      const b = dayNumber(v[rule.to]);
      return a === null || b === null || b < a ? '' : String(b - a + 1);
    }
    case 'copy': return text(v[rule.from]);
    case 'yearOf': { const m = text(v[rule.from]).match(/^(\d{4})-/); return m ? m[1] : undefined; }
    case 'lineCount': {
      if (!text(v[rule.from])) return undefined;
      return String(text(v[rule.from]).split('\n').filter((l) => l.trim()).length);
    }
    case 'join': { const joined = rule.from.map((k) => text(v[k])).filter(Boolean).join(rule.separator); return joined === '' ? undefined : joined; }
    case 'listParent': return ctx.parents ? (ctx.parents[text(v[rule.from])] ?? undefined) : undefined;
    case 'instituteCountry': return ctx.institutes?.get(text(v[`${rule.from}Code`]))?.country;
    case 'account': {
      if (!ctx.account) return undefined;
      return rule.key === 'name' ? ctx.account.name : ctx.account.dateOfJoining ?? '';
    }
    default: return undefined;
  }
}

/** Every computed field of a record, in field order, over whatever was sent. */
export function applyComputed(
  fields: ReadonlyArray<{ key: string; computed?: ComputedRule | null }>, input: Record<string, unknown>, ctx: ComputeContext = {},
): Record<string, unknown> {
  const out = { ...input };
  for (const f of fields) {
    if (!f.computed) continue;
    const v = computeValue(f.computed, out, ctx);
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}
