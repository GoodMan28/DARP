import { config } from 'dotenv';
config({ path: '.env.local' });

import { eq, sql } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { departments, cycles, masterListItems, users, auditLog } from '../src/server/db/schema';
import { hashPassword } from '../src/server/auth/password';

const DEPARTMENTS: Array<[string, string]> = [
  ['CSE', 'Computer Science & Engg.'],
  ['ME', 'Mechanical Engg.'],
  ['CE', 'Civil Engg.'],
  ['EEE', 'Electrical & Electronics Engg.'],
  ['BIO', 'Bio-Engineering'],
  ['CHE', 'Chemical Engg.'],
  ['HSS', 'Humanities & Social Sciences'],
];

const LISTS: Record<string, string[]> = {
  designations: ['Associate Lecturer', 'Lecturer', 'Assistant Professor', 'Associate Professor', 'Professor', 'Other'],
  natureOfAssociation: ['Regular', 'Contract', 'Visiting', 'Adjunct', 'Professor of Practice', 'Distinguished Visiting Professor'],
  ugQualifications: ['B.E./B.Tech', 'B.Sc', 'B.Arch', 'B.Pharm', 'BA', 'BBA', 'BCA', 'B.Com', 'Others'],
  pgQualifications: ['M.E./M.Tech', 'M.Sc', 'M.Arch/MUP', 'M.Pharm', 'MA', 'MBA', 'MCA', 'M.Com', 'Others', 'None'],
  indexingTypes: ['SCIE', 'Scopus', 'ESCI', 'SSCI', 'AHCI'],
  patentStatus: ['Published', 'Awarded/Granted'],
  patentCategories: ['Engineering', 'Pharmacy', 'Management', 'Others'],
  countries: ['India', 'United States', 'United Kingdom', 'Germany', 'Japan', 'Australia', 'Canada', 'Singapore', 'Other'],
  projectRoles: ['PI', 'Co-PI'],
  agencyCategories: ['Government', 'Non-Government'],
  fellowshipTypes: ['National fellowship', 'International fellowship', 'Financial support for advanced studies/research', 'International travel grant'],
  fellowshipStature: ['National', 'International'],
  riAwardCategories: ['Innovation', 'Technology transfer', 'Research', 'Others'],
  riAwardeeCategories: ['Institution', 'Teacher', 'Research scholar', 'Student'],
  awardLevels: ['International', 'National', 'State', 'Institutional'],
  finSupportPurpose: ['Conference/Workshop/Seminar/Symposium, etc', 'Membership for professional body'],
  finSupportType: ['National', 'International'],
  fdpProgramTypes: ['Professional Development Programmes', 'Orientation/Induction Programmes', 'Refresher Course', 'Short Term Course'],
  studentLevels: ['UG', 'PG', 'PHD'],
  competitiveExams: ['NET', 'SLET', 'GATE', 'GMAT', 'GPAT', 'CAT', 'GRE', 'JAM', 'IELET', 'TOEFL', 'Civil Services', 'State government examinations', 'Other examinations conducted by the State / Central Government Agencies'],
  personTitles: ['Prof.', 'Dr.', 'Mr.', 'Ms.', 'Mx.'],
  econtentPlatforms: ['e-PG-Pathshala', 'Consortium for Educational Communication (Undergraduate)', 'SWAYAM', 'Other MOOCs platforms', 'Other govt initiatives', 'Institutional LMS'],
  feedbackClassifications: [
    'A. Feedback collected, analysed, action taken & communicated to relevant body and feedback hosted on the institutional website',
    'B. Feedback collected, analysed, action has been taken and communicated to the relevant body',
    'C. Feedback collected and analysed',
    'D. Feedback collected',
    'E. Feedback not collected',
  ],
};

async function main() {
  // 1. Departments
  for (const [code, name] of DEPARTMENTS) {
    await db.insert(departments).values({ code, name }).onConflictDoNothing();
  }

  // 2. Master lists
  for (const [listKey, values] of Object.entries(LISTS)) {
    for (const [i, value] of values.entries()) {
      await db.insert(masterListItems)
        .values({ listKey, value, sortOrder: i })
        .onConflictDoNothing();
    }
  }

  // 3. The active cycle (locked decision #1)
  const existing = await db.select().from(cycles).where(eq(cycles.isActive, true));
  if (existing.length === 0) {
    await db.insert(cycles).values({
      name: 'NAAC Cycle 4 · 2022–2024',
      isActive: true,
      cyStart: '2022-01-01', cyEnd: '2024-12-31',
      fyStart: '2022-04-01', fyEnd: '2025-03-31',
      ayStart: '2022-07-01', ayEnd: '2025-06-30',
      entryOpensAt: new Date(),
      deadlineAt: null,
    });
  }

  // 4. First IQAC administrator. Password comes from the environment, never hard-coded.
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
    const found = await db.select().from(users).where(sql`lower(${users.email}) = lower(${adminEmail})`);
    if (found.length === 0) {
      const [admin] = await db.insert(users).values({
        email: adminEmail,
        name: 'IQAC Administrator',
        role: 'admin',
        passwordHash: await hashPassword(adminPassword),
        mustChangePassword: true,          // forced change on first login
      }).returning();
      await db.insert(auditLog).values({
        action: 'user.seed', entity: 'user', entityId: admin!.id,
        actorRole: 'admin', meta: { reason: 'initial administrator' },
      });
    }
  }

  // 5. The system account automatic approvals are recorded under. It can never sign in:
  //    it is inactive and its password is a random secret nobody knows.
  const sysFound = await db.select().from(users).where(sql`lower(${users.email}) = 'system@darp.invalid'`);
  if (sysFound.length === 0) {
    const { randomBytes } = await import('node:crypto');
    await db.insert(users).values({
      email: 'system@darp.invalid',
      name: 'DARP automatic check',
      role: 'admin',
      passwordHash: await hashPassword(randomBytes(48).toString('base64url')),
      mustChangePassword: false,
      isActive: false,
    });
  }

  await pool.end();
  console.error('seed complete');
}

main().catch((e) => { console.error(e); process.exit(1); });
