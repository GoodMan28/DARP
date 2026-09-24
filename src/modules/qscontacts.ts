// src/modules/qscontacts.ts
import type { ModuleConfig } from './_types';

export const qscontacts: ModuleConfig = {
  key: 'qscontacts',
  name: 'QS Academic Reputation Contacts',
  group: 'Faculty',
  periodType: 'AY',
  bodies: ['QS'],
  description:
    'Academic collaborators QS may contact for the Academic Reputation Survey. Consent must be obtained before a contact is submitted.',
  ownerRoles: ['faculty'],
  verifierRoles: ['dofa'],
  viewRoles: ['hod', 'dofa', 'admin'],
  scope: 'self',
  naturalKey: ['email'],
  fields: [
    { key: 'title', label: 'Title', type: 'select', required: true, listKey: 'personTitles',
      section: 'Contact',
      exportAs: { faculty: 'Title', dofa: 'Title' } },

    { key: 'firstName', label: 'First Name', type: 'text', required: true, maxLength: 80,
      section: 'Contact',
      exportAs: { faculty: 'First Name', dofa: 'First Name' } },

    { key: 'lastName', label: 'Last Name', type: 'text', required: true, maxLength: 80,
      section: 'Contact',
      exportAs: { faculty: 'Last Name', dofa: 'Last Name' } },

    { key: 'designation', label: 'Designation', type: 'text', required: true, maxLength: 120,
      section: 'Contact',
      help: 'The contact must be involved in teaching or research — academic, research or library staff.',
      exportAs: { faculty: 'Designation', dofa: 'Designation' } },

    { key: 'department', label: 'Department', type: 'text', required: true, maxLength: 160,
      section: 'Affiliation',
      exportAs: { faculty: 'Department', dofa: 'Department' } },

    { key: 'institution', label: 'Institution', type: 'text', required: true, maxLength: 200,
      section: 'Affiliation',
      exportAs: { faculty: 'Institution', dofa: 'Institution' } },

    { key: 'country', label: 'Country or Territory', type: 'select', required: true,
      listKey: 'countries', section: 'Affiliation',
      exportAs: { faculty: 'Country or Territory', dofa: 'Country or Territory' } },

    { key: 'email', label: 'Email', type: 'email', required: true, pii: 'masked', sensitive: true,
      section: 'Affiliation',
      help: 'A personal institutional address. Generic addresses such as info@ are not accepted.',
      exportAs: { faculty: 'Email', dofa: 'Email' } },

    { key: 'specialisation', label: 'Area of Specialisation', type: 'text', required: true,
      maxLength: 200, colSpan: 2, section: 'Affiliation',
      exportAs: { faculty: 'Area of Specialisation', dofa: 'Area of Specialisation' } },

    { key: 'phone', label: 'Phone (Optional)', type: 'phone', pii: 'masked', sensitive: true,
      section: 'Affiliation',
      exportAs: { faculty: 'Phone (Optional)', dofa: 'Phone (Optional)' } },

    { key: 'consentStatus', label: 'Consent status', type: 'select', required: true,
      options: ['Not yet contacted', 'Consent requested', 'Consent received', 'Declined'],
      section: 'Consent',
      help: 'Use the QS consent email template without altering it. A contact may only be submitted once consent is received.' },

    { key: 'consentDate', label: 'Date consent received', type: 'date', required: true,
      section: 'Consent', showIf: { field: 'consentStatus', in: ['Consent received'] } },

    { key: 'consentEvidence', label: 'Consent email / reply', type: 'file',
      accept: ['pdf', 'jpg', 'jpeg', 'png'], maxSizeMB: 5, colSpan: 2, section: 'Consent',
      showIf: { field: 'consentStatus', in: ['Consent received'] } },
  ],
  listColumns: ['lastName', 'firstName', 'institution', 'country', 'consentStatus'],
  defaultSort: { key: 'lastName', dir: 'asc' },
  exportTargets: [
    { workbook: 'faculty', sheet: 'QS Contacts' },
    { workbook: 'dofa', sheet: 'QS Contacts' },
  ],
};
