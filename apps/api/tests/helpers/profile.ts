/**
 * A complete Faculty Profile, as the form sends it. The profile has no draft: saving it needs every
 * required answer. The name and joining date are not sent: they come from the account. Needs
 * loadTestInstitutes() to have run (the UG degree names U-0202).
 */
export function fullProfile(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pan: 'ABCDE1234F', aadhaar: '234123412346', designation: 'Professor', natureOfAssociation: 'Regular',
    ugQualification: 'B.E./B.Tech', ugInstitutionCode: 'U-0202', pgQualification: 'None',
    hasPhd: 'No', hasPostdoc: 'No', highestDegreeDate: '2010-01-01',
    teachingExperienceMonths: '120', teachingHours: '300', researchHours: '200',
    ...over,
  };
}
