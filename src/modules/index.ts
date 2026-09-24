import type { ModuleConfig, ModuleGroup, Role } from './_types';

import { profile } from './profile';
import { publications } from './publications';
import { patents } from './patents';
import { books } from './books';
import { grants } from './grants';
import { consultancy } from './consultancy';
import { fellowships } from './fellowships';
import { seedmoney } from './seedmoney';
import { riawards } from './riawards';
import { awards } from './awards';
import { extawards } from './extawards';
import { finsupport } from './finsupport';
import { fdpattended } from './fdpattended';
import { studentsguided } from './studentsguided';
import { qscontacts } from './qscontacts';
import { mentorship } from './mentorship';
import { econtent } from './econtent';
import { mous } from './mous';
import { workshops } from './workshops';
import { fdporganised } from './fdporganised';
import { feedback } from './feedback';
import { edpmdp } from './edpmdp';
import { quality } from './quality';
import { exams } from './exams';

/** The 24 modules, in the canonical order of 00-START-HERE §0.6. */
export const MODULE_LIST: ModuleConfig[] = [
  profile, publications, patents, books, grants, consultancy, fellowships, seedmoney,
  riawards, awards, extawards, finsupport, fdpattended, studentsguided, qscontacts, mentorship,
  econtent, mous, workshops, fdporganised, feedback, edpmdp, quality, exams,
];

/** key → config. The only lookup any feature should use. */
export const MODULES: Record<string, ModuleConfig> = Object.fromEntries(
  MODULE_LIST.map((m) => [m.key, m]),
);

export const MODULE_KEYS = MODULE_LIST.map((m) => m.key);

/** Returns the config, or null for an unknown key — never throws on user input. */
export function getModule(key: string | undefined | null): ModuleConfig | null {
  if (!key) return null;
  return MODULES[key] ?? null;
}

/** The order groups appear in the navigation. */
export const GROUP_ORDER: ModuleGroup[] = [
  'Faculty', 'Research', 'Students', 'Teaching', 'Department', 'Institution',
];

/** Every module a role may open at all (own, verify or view). */
export function modulesForRole(role: Role): ModuleConfig[] {
  if (role === 'admin') return MODULE_LIST;
  return MODULE_LIST.filter(
    (m) => m.ownerRoles.includes(role) || m.verifierRoles.includes(role) || m.viewRoles.includes(role),
  );
}

/** Modules a role creates records in — what "my data entry" means for that role. */
export function modulesOwnedBy(role: Role): ModuleConfig[] {
  return MODULE_LIST.filter((m) => m.ownerRoles.includes(role));
}

/** Modules a role is the verifying office for — what their queue holds. */
export function modulesVerifiedBy(role: Role): ModuleConfig[] {
  if (role === 'admin') return MODULE_LIST;
  return MODULE_LIST.filter((m) => m.verifierRoles.includes(role));
}

/** Groups a role's modules for the sidebar, preserving GROUP_ORDER. */
export function groupModules(list: ModuleConfig[]): Array<{ group: ModuleGroup; modules: ModuleConfig[] }> {
  return GROUP_ORDER
    .map((group) => ({ group, modules: list.filter((m) => m.group === group) }))
    .filter((g) => g.modules.length > 0);
}

export type { ModuleConfig };
