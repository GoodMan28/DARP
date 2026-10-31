import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { closeDb } from '../helpers/db';
import { loadBitLists } from '../helpers/lists';
import { getListTree, getParents, getAllLists } from '@/server/records/masterLists';
import { validateRecord } from '@/server/records/validate';
import { DEPARTMENTS, PROGRAMMES, SPECIALISATIONS, DESIGNATIONS, bitListRows } from '../../scripts/data/bit-lists';
import type { ModuleConfig } from '@darp/shared/modules/types';

/* Phase 4: dropdown lists whose items belong under another list's items, with BIT Mesra's own data. */

beforeAll(async () => { await loadBitLists(); });
afterAll(async () => { await closeDb(); });

/** A module of two dependent dropdowns, to try the rules without any real module. */
const demo = (over: Record<string, unknown> = {}): ModuleConfig => ({
  key: 'demo', name: 'Demo', group: 'Students', periodType: 'AY', bodies: [], description: '', ownerRoles: ['faculty'], verifierRoles: [],
  viewRoles: [], scope: 'self', exportTargets: [], listColumns: [],
  fields: [
    { key: 'program', label: 'Program', type: 'select', required: true, listKey: 'programmes', acceptOldText: true },
    { key: 'specialisation', label: 'Specialisation', type: 'select', listKey: 'specialisations', dependsOn: 'program', acceptOldText: true },
    { key: 'designation', label: 'Designation', type: 'select', listKey: 'externalDesignations', allowOther: true, ...over },
  ],
}) as ModuleConfig;

describe('BIT’s data', () => {
  it('has 20 departments with distinct codes and names', () => {
    expect(DEPARTMENTS).toHaveLength(20);
    expect(new Set(DEPARTMENTS.map(([c]) => c)).size).toBe(20);
    expect(new Set(DEPARTMENTS.map(([, n]) => n)).size).toBe(20);
  });

  it('puts every programme under a level and every specialisation under a programme', () => {
    expect(PROGRAMMES.every(([level]) => ['UG', 'PG', 'PHD'].includes(level))).toBe(true);
    expect(Object.keys(SPECIALISATIONS).every((p) => PROGRAMMES.some(([, name]) => name === p))).toBe(true);
    const rows = bitListRows();
    expect(new Set(rows.map((r) => `${r.listKey}|${r.parent}|${r.value}`)).size).toBe(rows.length);
    expect(DESIGNATIONS).toEqual(expect.arrayContaining(['Assistant Professor', 'Associate Professor', 'Professor', 'Professor of Practice', 'Other']));
  });
});

describe('the lists with parents', () => {
  it('keeps one name under two parents, as two items', async () => {
    const tree = await getListTree();
    expect(tree.specialisations!['B.Tech.']).toContain('Biotechnology');
    expect(tree.specialisations!['M.Tech.']).toContain('Biotechnology');
    expect(tree.specialisations!['M.Sc.']).toContain('Biotechnology');
    expect((await getAllLists()).specialisations!.filter((v) => v === 'Biotechnology')).toHaveLength(1);
  });

  it('knows each programme’s level', async () => {
    const levels = await getParents('programmes');
    expect(levels).toMatchObject({ 'B.Tech.': 'UG', 'M.Tech.': 'PG', MBA: 'PG', 'Ph.D.': 'PHD', 'Integrated M.Sc.': 'PG' });
  });

  it('leaves a programme with no specialisations with none', async () => {
    const tree = await getListTree();
    for (const p of ['MCA', 'B.Arch.', 'BBA', 'BCA', 'MUP']) expect(tree.specialisations![p]).toBeUndefined();
  });
});

describe('a dependent dropdown', () => {
  it('takes a specialisation of the chosen programme only', async () => {
    const ok = await validateRecord(demo(), { program: 'M.Tech.', specialisation: 'Aerospace Engineering', designation: 'x' }, 'submit');
    expect(ok.errors).toEqual({});
    const wrong = await validateRecord(demo(), { program: 'MBA', specialisation: 'Aerospace Engineering', designation: 'x' }, 'submit');
    expect(wrong.errors.specialisation).toBe('Choose one of the listed values.');
  });

  it('accepts none for a programme that has none, and refuses one', async () => {
    expect((await validateRecord(demo(), { program: 'MCA', designation: 'x' }, 'submit')).errors).toEqual({});
    expect((await validateRecord(demo(), { program: 'MCA', specialisation: 'Anything', designation: 'x' }, 'submit')).errors.specialisation)
      .toBe('Choose one of the listed values.');
  });

  it('keeps text typed before the dropdown existed in a draft, and asks for a choice on submitting', async () => {
    const old = { program: 'BTech', specialisation: 'CSE', designation: 'x' };
    const draft = await validateRecord(demo(), old, 'draft');
    expect(draft.errors).toEqual({});
    expect(draft.data).toMatchObject({ program: 'BTech', specialisation: 'CSE' });
    const submit = await validateRecord(demo(), old, 'submit');
    expect(submit.errors).toMatchObject({ program: 'Choose one of the listed values.', specialisation: 'Choose one of the listed values.' });
  });

  it('takes a typed answer where the dropdown allows "Other"', async () => {
    const r = await validateRecord(demo(), { program: 'B.Tech.', designation: 'Reader (Emeritus)' }, 'submit');
    expect(r.errors).toEqual({});
    expect(r.data.designation).toBe('Reader (Emeritus)');
  });
});
