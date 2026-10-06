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
import * as moduleRecord from './modules/record';
import * as moduleTransition from './modules/transition';
import * as moduleDeclare from './modules/declare';
import * as lookup from './lookup';
import * as evidenceUpload from './evidence/upload';
import * as evidenceFile from './evidence/file';
import * as exportWorkbook from './export';
import * as profileRollups from './profile-rollups';
import * as adminUsers from './admin/users';
import * as adminUser from './admin/user';
import * as adminAudit from './admin/audit';
import * as adminBaselines from './admin/baselines';
import * as adminCycles from './admin/cycles';
import * as adminMasterLists from './admin/master-lists';
import * as adminJournalLists from './admin/journal-lists';
import * as adminReveal from './admin/reveal';

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
api.post('/modules/:moduleKey/records', moduleRecords.POST);
api.get('/modules/:moduleKey/records/:id', moduleRecord.GET);
api.patch('/modules/:moduleKey/records/:id', moduleRecord.PATCH);
api.delete('/modules/:moduleKey/records/:id', moduleRecord.DELETE);
api.post('/modules/:moduleKey/records/:id/transition', moduleTransition.POST);
api.post('/modules/:moduleKey/declare', moduleDeclare.POST);
api.post('/lookup/:moduleKey', lookup.POST);

api.post('/evidence', evidenceUpload.POST);
api.get('/evidence/:id', evidenceFile.GET);
api.delete('/evidence/:id', evidenceFile.DELETE);

api.get('/export/:workbook', exportWorkbook.GET);

api.get('/profile/rollups', profileRollups.GET);
api.patch('/profile/rollups', profileRollups.PATCH);

api.get('/admin/users', adminUsers.GET);
api.post('/admin/users', adminUsers.POST);
api.patch('/admin/users/:id', adminUser.PATCH);
api.get('/admin/audit', adminAudit.GET);
api.get('/admin/baselines', adminBaselines.GET);
api.patch('/admin/baselines', adminBaselines.PATCH);
api.get('/admin/cycles', adminCycles.GET);
api.patch('/admin/cycles', adminCycles.PATCH);
api.get('/admin/master-lists', adminMasterLists.GET);
api.post('/admin/master-lists', adminMasterLists.POST);
api.patch('/admin/master-lists', adminMasterLists.PATCH);
api.get('/admin/journal-lists', adminJournalLists.GET);
api.post('/admin/journal-lists', adminJournalLists.POST);
api.post('/admin/reveal/:recordId/:fieldKey', adminReveal.POST);
