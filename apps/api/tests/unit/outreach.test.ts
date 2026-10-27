import { describe, it, expect, vi } from 'vitest';
import { MODULES, MODULE_LIST, modulesForRole, groupModules } from '@darp/shared/modules';
import { validateRecord } from '@/server/records/validate';
import { prepareForStorage, buildSearchText, buildNaturalKey } from '@/server/records/prepare';
import { resolvePeriod } from '@/server/records/periods';

vi.mock('@/server/records/masterLists', () => ({
  getAllLists: vi.fn().mockResolvedValue({}),
}));

const outreach = MODULES.outreach!;

const validRecord = {
  year: 2024,
  activityType: 'Community Outreach & Engagement',
  eventName: 'Clean Campus and Green Jharkhand Initiative',
  organisation: 'Jharkhand State Pollution Control Board',
};

const cycle = {
  id: 'c1',
  cyStart: '2022-01-01', cyEnd: '2024-12-31',
  fyStart: '2022-04-01', fyEnd: '2025-03-31',
  ayStart: '2022-07-01', ayEnd: '2025-06-30',
};

describe('Outreach Activities module configuration', () => {
  it('exists and is properly registered in MODULES', () => {
    expect(outreach).toBeDefined();
    expect(outreach.key).toBe('outreach');
    expect(outreach.name).toBe('Outreach Activities');
    expect(outreach.group).toBe('Faculty');
    expect(outreach.scope).toBe('self');
    expect(outreach.periodType).toBe('CY');
    expect(MODULE_LIST.some((m) => m.key === 'outreach')).toBe(true);
  });

  it('is assigned to the Faculty section in the navigation for both faculty and admin', () => {
    const facultyModules = modulesForRole('faculty');
    expect(facultyModules.some((m) => m.key === 'outreach')).toBe(true);

    const adminModules = modulesForRole('admin');
    expect(adminModules.some((m) => m.key === 'outreach')).toBe(true);

    const facultyGroups = groupModules(facultyModules);
    const facultyGroup = facultyGroups.find((g) => g.group === 'Faculty');
    expect(facultyGroup?.modules.some((m) => m.key === 'outreach')).toBe(true);

    const adminGroups = groupModules(adminModules);
    const adminFacultyGroup = adminGroups.find((g) => g.group === 'Faculty');
    expect(adminFacultyGroup?.modules.some((m) => m.key === 'outreach')).toBe(true);
  });

  it('has correct role permissions', () => {
    expect(outreach.ownerRoles).toContain('faculty');
    expect(outreach.verifierRoles).toContain('dofa');
    expect(outreach.viewRoles).toContain('admin');
    expect(outreach.viewRoles).toContain('hod');
    expect(outreach.viewRoles).toContain('dofa');
  });

  it('configures required fields: activityType, eventName, organisation, year', () => {
    const fieldKeys = outreach.fields.map((f) => f.key);
    expect(fieldKeys).toContain('activityType');
    expect(fieldKeys).toContain('eventName');
    expect(fieldKeys).toContain('organisation');
    expect(fieldKeys).toContain('year');
    expect(fieldKeys).toContain('evidence');

    const activityTypeField = outreach.fields.find((f) => f.key === 'activityType')!;
    expect(activityTypeField.type).toBe('select');
    expect(activityTypeField.required).toBe(true);
    expect(activityTypeField.options?.length).toBeGreaterThan(0);

    const eventNameField = outreach.fields.find((f) => f.key === 'eventName')!;
    expect(eventNameField.type).toBe('text');
    expect(eventNameField.required).toBe(true);

    const orgField = outreach.fields.find((f) => f.key === 'organisation')!;
    expect(orgField.type).toBe('text');
    expect(orgField.required).toBe(true);

    const yearField = outreach.fields.find((f) => f.key === 'year')!;
    expect(yearField.type).toBe('year');
    expect(yearField.required).toBe(true);
  });

  it('configures list columns and default sort', () => {
    expect(outreach.listColumns).toEqual(['eventName', 'activityType', 'organisation', 'year']);
    expect(outreach.defaultSort).toEqual({ key: 'year', dir: 'desc' });
  });

  it('configures natural key duplicate guard', () => {
    expect(outreach.naturalKey).toEqual(['eventName', 'organisation', 'year']);
    const key = buildNaturalKey(outreach, validRecord);
    expect(key).toBe('outreach:clean campus and green jharkhand initiative|jharkhand state pollution control board|2024');
  });
});

describe('Outreach Activities validation & period resolution', () => {
  it('validates a complete record successfully on submit', async () => {
    const res = await validateRecord(outreach, validRecord, 'submit');
    expect(res.ok).toBe(true);
  });

  it('allows a partial draft', async () => {
    const res = await validateRecord(outreach, { eventName: 'Science Talk' }, 'draft');
    expect(res.ok).toBe(true);
  });

  it('fails submit when required fields are missing', async () => {
    const res = await validateRecord(outreach, { eventName: 'Science Talk' }, 'submit');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.organisation).toBeDefined();
      expect(res.errors.year).toBeDefined();
      expect(res.errors.activityType).toBeDefined();
    }
  });

  it('resolves reporting period correctly from the year field', () => {
    const period = resolvePeriod(outreach, { year: 2024 }, cycle);
    expect(period.periodYear).toBe(2024);
    expect(period.periodLabel).toBe('2024');
  });
});

describe('Outreach Activities searchable text and indexing', () => {
  it('builds search text including faculty owner name, event name, organisation, activity type, and year', () => {
    const searchText = buildSearchText(outreach, validRecord, 'Dr. Ramesh Sharma');
    expect(searchText).toContain('dr. ramesh sharma');
    expect(searchText).toContain('clean campus');
    expect(searchText).toContain('jharkhand state pollution control board');
    expect(searchText).toContain('community outreach & engagement');
    expect(searchText).toContain('2024');
  });

  it('prepares record for storage with naturalKey and searchable text', () => {
    const prepared = prepareForStorage(outreach, validRecord, null, 'Prof. Sunita Rao');
    expect(prepared.naturalKey).toBe(
      'outreach:clean campus and green jharkhand initiative|jharkhand state pollution control board|2024',
    );
    expect(prepared.searchText).toContain('sunita rao');
    expect(prepared.searchText).toContain('clean campus');
  });
});
