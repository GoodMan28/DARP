/**
 * Replaces the DEMO data of two modules, Students Qualifying Competitive Exams (CDC) and Students Guided,
 * with a small set made to show what CDC's report does: a student CDC and a guide both entered, a student
 * with two exams (one from CDC and one from a guide), students only a guide entered, and one the guide says
 * was not at BIT. Only records owned by the demo accounts (@demo.bitmesra.ac.in) are removed;
 * a real person's record is never touched. The removed rows are first written to a JSON file.
 *
 *   npm run db:seed:exams-demo -w @darp/api -- --backup <file.json>
 */
import { writeFileSync } from 'node:fs';
import { and, eq, inArray, like } from 'drizzle-orm';
import { db, pool } from '../src/server/db';
import { departments, records, users } from '../src/server/db/schema';
import { createRecord } from '../src/server/records/service';
import { audit } from '../src/server/audit/log';
import { getListTree } from '../src/server/records/masterLists';
import type { SessionUser } from '../src/server/auth/session';

const backupAt = process.argv[process.argv.indexOf('--backup') + 1];
if (!backupAt || backupAt.startsWith('--')) throw new Error('Say where to write the backup: --backup <file.json>');

async function actorOf(email: string): Promise<SessionUser> {
  const [u] = await db.select({ u: users, d: departments }).from(users).leftJoin(departments, eq(departments.id, users.departmentId)).where(eq(users.email, email)).limit(1);
  if (!u) throw new Error(`Demo account ${email} is missing: run npm run db:seed:demo first.`);
  return {
    id: u.u.id, email: u.u.email, name: u.u.name, role: u.u.role, departmentId: u.d?.id ?? null, departmentName: u.d?.name ?? null,
    departmentCode: u.d?.code ?? null, dateOfJoining: u.u.dateOfJoining ? String(u.u.dateOfJoining).slice(0, 10) : null,
    mustChangePassword: false, sessionId: 'seed',
  };
}

// 1. What goes: demo-owned records of the two modules. Written to a file first.
const demoOwners = db.select({ id: users.id }).from(users).where(like(users.email, '%@demo.bitmesra.ac.in'));
const old = await db.select().from(records).where(and(inArray(records.moduleKey, ['exams', 'studentsguided']), inArray(records.ownerUserId, demoOwners)));
writeFileSync(backupAt, JSON.stringify(old, null, 1));
console.log(`Backed up ${old.length} record(s) to ${backupAt}`);
await db.delete(records).where(inArray(records.id, old.map((r) => r.id)));
await audit({ action: 'record.delete', entity: 'record', meta: { change: 'demo exams and students guided replaced', removed: old.length } });
console.log(`Removed ${old.length} demo record(s).`);

// 2. What comes: made through the same service a person's save goes through, so every rule applies.
const cdc = await actorOf('cdc@demo.bitmesra.ac.in');
const mahato = await actorOf('mahato@demo.bitmesra.ac.in');     // Computer Science and Engineering
const verma = await actorOf('verma@demo.bitmesra.ac.in');       // Computer Science and Engineering
const ranjan = await actorOf('ranjan@demo.bitmesra.ac.in');     // Electrical and Electronics Engineering
const kujur = await actorOf('kujur@demo.bitmesra.ac.in');       // Mechanical Engineering

const tree = await getListTree();
const branch = (programme: string, at = 0) => (tree.specialisations?.[programme] ?? [])[at] ?? '';

const guided = (over: Record<string, unknown>) => ({
  program: 'B.Tech.', specialisation: branch('B.Tech.'), affiliatedToBit: 'Yes', ...over,
});
const exam = (over: Record<string, unknown>) => ({ ...over });

let made = 0;
const make = async (who: SessionUser, moduleKey: string, data: Record<string, unknown>) => {
  await createRecord(who, moduleKey, data, 'submit');
  made += 1;
};

/* CDC's own list */
await make(cdc, 'exams', exam({ year: '2023', examName: 'GATE', studentName: 'Ravi Kumar', registrationNo: 'GATE-23-1001', rollNo: 'BIT/2019/CSE/041' }));
await make(cdc, 'exams', exam({ year: '2023', examName: 'CAT', studentName: 'Ravi Kumar', registrationNo: 'CAT-23-5521', rollNo: 'BIT/2019/CSE/041' }));
await make(cdc, 'exams', exam({ year: '2022', examName: 'NET', studentName: 'Sneha Oraon', registrationNo: 'NET-22-3310', rollNo: 'BIT/2018/EEE/017' }));
await make(cdc, 'exams', exam({ year: '2023', examName: 'Civil Services', studentName: 'Pooja Sinha', registrationNo: 'UPSC-23-90441', rollNo: 'BIT/2017/ME/009' }));
await make(cdc, 'exams', exam({ year: '2024', examName: 'JAM', studentName: 'Aman Tirkey', registrationNo: 'JAM-24-778', rollNo: 'BIT/2020/MBA/012' }));

/* What the guides entered: students who went on to a competitive exam */
const examGuided = (who: SessionUser, over: Record<string, unknown>) => make(who, 'studentsguided', guided({
  statusAfterPassing: 'Competitive exams', ...over,
}));
await examGuided(mahato, { studentName: 'Ravi Kumar', rollNo: 'BIT/2019/CSE/041', yearOfPassing: '2023', examGiven: 'GATE', examRegistrationNo: 'GATE-23-1001' });   // CDC has him too: counted once
await examGuided(mahato, { studentName: 'Neha Gupta', rollNo: 'BIT/2019/CSE/052', yearOfPassing: '2023', examGiven: 'GATE', examRegistrationNo: 'GATE-23-1044' });   // only the guide has her
await examGuided(verma, { studentName: 'Karan Mehta', rollNo: 'BIT/2018/CSE/033', yearOfPassing: '2022', examGiven: 'GRE', examRegistrationNo: 'GRE-22-6612' });
await examGuided(verma, { studentName: 'Isha Prasad', rollNo: 'BIT/2018/CSE/036', yearOfPassing: '2023', examGiven: 'CAT', examRegistrationNo: 'CAT-23-8120' });
await examGuided(ranjan, { studentName: 'Sneha Oraon', rollNo: 'BIT/2018/EEE/017', yearOfPassing: '2022', examGiven: 'GATE', examRegistrationNo: 'GATE-22-2210', specialisation: branch('B.Tech.', 1) });   // a second exam for CDC's NET student
await examGuided(ranjan, { studentName: 'Deepak Soren', rollNo: 'BIT/2019/EEE/021', yearOfPassing: '2023', examGiven: 'JAM', examRegistrationNo: 'JAM-23-402', affiliatedToBit: 'No', specialisation: branch('B.Tech.', 1) });   // not at BIT: left out

/* The other things a student does after passing, for the rest of the module */
await make(mahato, 'studentsguided', guided({ studentName: 'Rohit Das', rollNo: 'BIT/2019/CSE/058', yearOfPassing: '2023', statusAfterPassing: 'Employed', employerName: 'x', employerNameCode: 'ROR-01b9n8m42', payPackage: '700000' }));
await make(verma, 'studentsguided', guided({ studentName: 'Priya Nair', rollNo: 'BIT/2018/CSE/040', yearOfPassing: '2022', statusAfterPassing: 'Higher Studies', institutionEnrolled: 'x', institutionEnrolledCode: 'U-0573', programEnrolled: 'M.Tech./M.E.' }));
await make(kujur, 'studentsguided', guided({ studentName: 'Sanjay Lakra', rollNo: 'BIT/2019/ME/030', yearOfPassing: '2023', statusAfterPassing: 'None of the above', specialisation: branch('B.Tech.', 2) }));

console.log(`Made ${made} new record(s) through the normal rules.`);
await pool.end();
