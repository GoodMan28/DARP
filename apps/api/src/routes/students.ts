import { withRoute, ok } from '@/server/http/handler';
import { toResponse } from '@/server/records/toResponse';
import { earlierStudent } from '@/server/records/students';
import { facultyExamsNotInList } from '@/server/records/examsFromFaculty';

/**
 * A student the person entered before, for the roll-number box to fill the rest from:
 * GET /api/students/earlier?rollNo=BTECH/1234/22. Only the caller's own entries are read.
 */
export const EARLIER = withRoute({ rate: { limit: 120, windowSeconds: 60 } }, async ({ actor, query }) => {
  try { return ok(await earlierStudent(actor, (query.get('rollNo') ?? '').slice(0, 60))); }
  catch (e) { return toResponse(e); }
});

/**
 * Students the faculty entered as qualifying in a competitive exam, that CDC's own list does not hold:
 * GET /api/exams/from-faculty. CDC and IQAC only (the service refuses anyone else).
 */
export const FROM_FACULTY = withRoute({ rate: { limit: 60, windowSeconds: 60 } }, async ({ actor }) => {
  try { return ok(await facultyExamsNotInList(actor)); } catch (e) { return toResponse(e); }
});
