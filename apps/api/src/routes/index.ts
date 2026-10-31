import { Router } from 'express';
import * as health from './health';
import * as me from './me';
import * as dashboard from './dashboard';
import * as login from './auth/login';
import * as logout from './auth/logout';
import * as forgot from './auth/forgot';
import * as reset from './auth/reset';
import * as changePassword from './auth/change-password';
import * as moduleSchema from './modules/schema';
import * as moduleRecords from './modules/records';
import * as moduleRecordsExport from './modules/recordsExport';
import * as moduleViews from './modules/views';
import * as moduleRecord from './modules/record';
import * as moduleTransition from './modules/transition';
import * as moduleDeclare from './modules/declare';
import * as moduleBulk from './modules/bulk';
import * as reports from './reports';
import * as research from './research';
import * as lookup from './lookup';
import * as journals from './journals';
import * as institutions from './institutions';
import * as evidenceUpload from './evidence/upload';
import * as evidenceFile from './evidence/file';
import * as exportWorkbook from './export';
import * as profileRollups from './profile-rollups';
import * as profileIdentity from './profile-identity';
import * as adminUsers from './admin/users';
import * as adminUser from './admin/user';
import * as adminAudit from './admin/audit';
import * as adminBaselines from './admin/baselines';
import * as adminCycles from './admin/cycles';
import * as adminMasterLists from './admin/master-lists';
import * as adminDepartments from './admin/departments';
import * as adminJournalLists from './admin/journal-lists';
import * as adminReveal from './admin/reveal';
import * as adminDeleted from './admin/deleted-records';

/**
 * Every endpoint the API serves, in one table. Each handler (bar /health) is built with
 * `withRoute()`, which owns authentication, CSRF, rate limiting and validation, so a
 * line here never needs middleware of its own.
 */
export const api = Router();

api.get('/health', health.GET);
api.get('/me', me.GET);
api.get('/dashboard', dashboard.GET);

api.post('/auth/login', login.POST);
api.post('/auth/logout', logout.POST);
api.post('/auth/forgot', forgot.POST);
api.post('/auth/reset', reset.POST);
api.post('/auth/change-password', changePassword.POST);

api.get('/modules/:moduleKey/schema', moduleSchema.GET);
api.get('/modules/:moduleKey/records', moduleRecords.GET);
// Before /records/:id, or "export" would be read as a record's id.
api.get('/modules/:moduleKey/records/export', moduleRecordsExport.GET);
api.get('/modules/:moduleKey/views', moduleViews.GET);
api.post('/modules/:moduleKey/views', moduleViews.POST);
api.delete('/modules/:moduleKey/views/:id', moduleViews.DELETE);
api.post('/modules/:moduleKey/records', moduleRecords.POST);
api.get('/modules/:moduleKey/records/:id', moduleRecord.GET);
api.patch('/modules/:moduleKey/records/:id', moduleRecord.PATCH);
api.delete('/modules/:moduleKey/records/:id', moduleRecord.DELETE);
api.post('/modules/:moduleKey/records/:id/transition', moduleTransition.POST);
api.post('/modules/:moduleKey/declare', moduleDeclare.POST);
api.get('/modules/:moduleKey/bulk', moduleBulk.LIST);
api.post('/modules/:moduleKey/bulk', moduleBulk.POST);
api.get('/modules/:moduleKey/bulk/:id', moduleBulk.GET);
api.post('/modules/:moduleKey/bulk/:id/evidence', moduleBulk.EVIDENCE);
api.post('/modules/:moduleKey/bulk/:id/affiliation', moduleBulk.AFFILIATION);
api.post('/modules/:moduleKey/bulk/:id/submit', moduleBulk.SUBMIT);
api.post('/lookup/:moduleKey', lookup.POST);
api.get('/journals/ranking', journals.GET);
api.get('/institutions/search', institutions.SEARCH);

api.post('/evidence', evidenceUpload.POST);
api.get('/evidence/:id', evidenceFile.GET);
api.delete('/evidence/:id', evidenceFile.DELETE);

api.get('/export/:workbook', exportWorkbook.GET);
api.get('/reports/options', reports.OPTIONS);
api.get('/reports/research-quality', research.QUALITY);
api.get('/profile/research', research.GET);
api.put('/profile/research/ids', research.PUT_IDS);
api.post('/profile/research/wos', research.POST_WOS);
api.post('/profile/research/scopus', research.POST_SCOPUS);
api.post('/profile/research/refresh', research.POST_REFRESH);
api.get('/admin/research/thresholds', research.GET_THRESHOLDS);
api.put('/admin/research/thresholds', research.PUT_THRESHOLDS);
api.get('/reports/:format/summary', reports.SUMMARY);
api.get('/reports/:format', reports.GET);

api.get('/profile/rollups', profileRollups.GET);
api.patch('/profile/rollups', profileRollups.PATCH);
api.get('/profile/identity', profileIdentity.GET);
api.post('/profile/orcid', profileIdentity.POST_ORCID);
api.delete('/profile/orcid', profileIdentity.DELETE_ORCID);

api.get('/admin/users', adminUsers.GET);
api.post('/admin/users', adminUsers.POST);
api.patch('/admin/users/:id', adminUser.PATCH);
api.get('/admin/audit', adminAudit.GET);
api.get('/admin/baselines', adminBaselines.GET);
api.patch('/admin/baselines', adminBaselines.PATCH);
api.get('/admin/cycles', adminCycles.GET);
api.post('/admin/cycles', adminCycles.POST);
api.patch('/admin/cycles', adminCycles.PATCH);
api.delete('/admin/cycles', adminCycles.DELETE);
api.get('/admin/master-lists', adminMasterLists.GET);
api.post('/admin/master-lists', adminMasterLists.POST);
api.patch('/admin/master-lists', adminMasterLists.PATCH);
api.get('/admin/departments', adminDepartments.GET);
api.post('/admin/departments', adminDepartments.POST);
api.patch('/admin/departments', adminDepartments.PATCH);
api.get('/admin/journal-lists', adminJournalLists.GET);
api.post('/admin/journal-lists', adminJournalLists.POST);
api.get('/admin/deleted-records', adminDeleted.GET);
api.post('/admin/deleted-records', adminDeleted.POST);
api.post('/admin/reveal/:recordId/:fieldKey', adminReveal.POST);
