/*
 * BIT Mesra's own departments, programmes and designations, for the dropdowns. These come from BIT's
 * public documents (sources below); IQAC checks them and edits them on screen afterwards.
 *
 * Sources: Placement E-Brochure 2025-26; Admission Brochure (NRI/OCI/FN) 2026 and 2025; Ph.D. Admission
 * Brochure Spring 2026; Tentative Admission Calendar 2026-27; IQAC's NBA DCP 2025, Table A6.1
 * (conference.bitmesra.ac.in/ContentUploaded/iqac/files/UG Chemical DCP 2025.pdf); Faculty Recruitment
 * Advt. GO/RECTT/2025-26/FAC-1; Annual Report 2021-22.
 */

/** [code, name]. Placement Brochure 2025-26 (19 departments), and Hotel Management from NBA Table A6.1. */
import { COUNTRIES } from './countries';

export const DEPARTMENTS: Array<[string, string]> = [
  ['ARCH', 'Architecture and Planning'],
  ['BIO', 'Bioengineering and Biotechnology'],
  ['CHE', 'Chemical Engineering'],
  ['CFET', 'Centre for Food Engineering and Technology'],
  ['CHEM', 'Chemistry'],
  ['CE', 'Civil and Environmental Engineering'],
  ['CSE', 'Computer Science and Engineering'],
  ['CQEDS', 'Centre for Quantitative Economics and Data Science'],
  ['EEE', 'Electrical and Electronics Engineering'],
  ['ECE', 'Electronics and Communication Engineering'],
  ['HMCT', 'Hotel Management and Catering Technology'],
  ['HSS', 'Humanities and Social Sciences'],
  ['MGMT', 'Management'],
  ['MATH', 'Mathematics'],
  ['ME', 'Mechanical Engineering'],
  ['PHARM', 'Pharmaceutical Sciences and Technology'],
  ['PHY', 'Physics'],
  ['PIE', 'Production and Industrial Engineering'],
  ['RSG', 'Remote Sensing and Geoinformatics'],
  ['SER', 'Space Engineering and Rocketry'],
];

/** IQAC's Faculty format keeps its six; the 2025 recruitment advertisement adds the Practice grades, plus Adjunct and Visiting. */
export const DESIGNATIONS = [
  'Associate Lecturer', 'Lecturer', 'Assistant Professor', 'Associate Professor', 'Professor',
  'Assistant Professor of Practice', 'Associate Professor of Practice', 'Professor of Practice',
  'Adjunct Professor', 'Visiting Professor', 'Other',
];

/** [level, programme]. Admission Brochure 2026, Calendar 2026-27, Annual Report 2021-22 (B.E.). */
export const PROGRAMMES: Array<[string, string]> = [
  ['UG', 'B.Tech.'], ['UG', 'B.E.'], ['UG', 'B.Arch.'], ['UG', 'B.Pharm.'], ['UG', 'BHM'], ['UG', 'BBA'], ['UG', 'BCA'], ['UG', 'B.Sc.'],
  ['PG', 'M.Tech.'], ['PG', 'M.Pharm.'], ['PG', 'MBA'], ['PG', 'MCA'], ['PG', 'MUP'], ['PG', 'M.Sc.'],
  ['PG', 'Integrated M.Sc.'], ['PG', 'Integrated MBA'],
  ['PHD', 'Ph.D.'],
];

/** Programme → specialisations. A programme with none (B.Arch., B.Pharm., BHM, BBA, BCA, MCA, MUP, Integrated MBA) has no second box. */
export const SPECIALISATIONS: Record<string, string[]> = {
  'B.Tech.': [
    'Biotechnology', 'Chemical Engineering', 'Civil Engineering', 'Computer Science & Engineering',
    'Computer Science & Engineering (Artificial Intelligence and Machine Learning)', 'Electrical Engineering',
    'Electrical & Electronics Engineering', 'Electronics & Communication Engineering', 'Food Engineering and Technology',
    'Mechanical Engineering', 'Production & Industrial Engineering', 'Information Technology', 'Chemical Engineering (Plastic & Polymer)',
  ],
  'B.E.': [
    'Biotechnology', 'Chemical Engineering', 'Chemical Engineering (Plastic & Polymer)', 'Civil Engineering', 'Computer Science',
    'Electrical and Electronics', 'Electronics and Communication', 'Information Technology', 'Mechanical', 'Production',
  ],
  'B.Sc.': ['Animation & Multimedia', 'Medical Lab Technology'],
  'M.Tech.': [
    'Aerospace Engineering', 'Artificial Intelligence and Machine Learning', 'Biotechnology', 'Civil Engineering',
    'Computer Science & Engineering', 'Electric Vehicle Technology', 'Electrical Engineering', 'Electronics & Communication Engineering',
    'Environmental Science & Engineering', 'Mechanical Engineering', 'Production and Industrial Engineering',
    'Remote Sensing', 'Remote Sensing and Geographical Information System', 'VLSI Design and Embedded System', 'Wireless Communication Technology',
  ],
  'M.Pharm.': ['Pharmaceutical Chemistry', 'Pharmaceutical Quality Assurance', 'Pharmaceutics', 'Pharmacognosy', 'Pharmacology'],
  MBA: ['Marketing', 'Finance', 'Human Resource', 'Business Analytics', 'Operations', 'IT & Operations'],
  'M.Sc.': [
    'Biotechnology', 'Chemistry', 'Environmental Science and Management', 'Environmental Science and Technology',
    'Geo-Informatics', 'Mathematics', 'Physics',
  ],
  'Integrated M.Sc.': ['Chemistry', 'Food Technology', 'Mathematics & Computing', 'Physics', 'Quantitative Economics & Data Science'],
  'Ph.D.': [
    'Architecture & Planning', 'Bio-Medical Engineering', 'Biotechnology', 'Chemical Engineering', 'Polymer Engineering',
    'Food Engineering and Technology', 'Chemistry', 'Civil Engineering', 'Environmental Science', 'Computer Science & Engineering',
    'Data Science', 'Economics', 'Mathematics', 'Statistics', 'Electrical & Electronics Engineering',
    'Electronics & Communication Engineering', 'Management', 'Hospitality & Tourism Management', 'Mechanical Engineering',
    'Pharmaceutical Science & Technology', 'Physics', 'Production & Industrial Engineering', 'Remote Sensing',
    'Space Engineering & Rocketry', 'English', 'French',
  ],
};

/** For people and places outside BIT: a dropdown plus "Other". IQAC edits these. */
export const EXTERNAL_DESIGNATIONS = [
  'Professor', 'Associate Professor', 'Assistant Professor', 'Reader', 'Senior Lecturer', 'Lecturer', 'Head of Department', 'Dean',
  'Director', 'Vice Chancellor', 'Scientist', 'Researcher', 'Post-doctoral Fellow',
];
export const EXTERNAL_DEPARTMENTS = DEPARTMENTS.map(([, name]) => name).filter((n) => !n.startsWith('Centre'));
/** QS's five faculty areas. */
export const SUBJECT_AREAS = ['Arts & Humanities', 'Engineering & Technology', 'Life Sciences & Medicine', 'Natural Sciences', 'Social Sciences & Management'];
/** Degrees a student goes on to, or a thesis candidate is working for, elsewhere. */
export const HIGHER_STUDY_PROGRAMMES = ['M.Tech./M.E.', 'M.S.', 'M.Sc.', 'M.Arch.', 'M.Plan.', 'M.Pharm.', 'MBA', 'MCA', 'M.A.', 'Ph.D.'];

export interface ListRow { listKey: string; parent: string; value: string; sortOrder: number }

/** Every list item above as rows, in order, ready to insert. */
export function bitListRows(): ListRow[] {
  const rows: ListRow[] = [];
  const add = (listKey: string, values: string[], parent = '') => values.forEach((value, i) => rows.push({ listKey, parent, value, sortOrder: i + 1 }));
  add('designations', DESIGNATIONS);
  for (const level of ['UG', 'PG', 'PHD']) add('programmes', PROGRAMMES.filter(([l]) => l === level).map(([, p]) => p), level);
  for (const [programme, values] of Object.entries(SPECIALISATIONS)) add('specialisations', values, programme);
  add('externalDesignations', EXTERNAL_DESIGNATIONS);
  add('externalDepartments', EXTERNAL_DEPARTMENTS);
  add('subjectAreas', SUBJECT_AREAS);
  add('higherStudyProgrammes', HIGHER_STUDY_PROGRAMMES);
  add('countries', COUNTRIES);
  return rows;
}
