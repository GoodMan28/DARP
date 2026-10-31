import { describe, it, expect } from 'vitest';
import { institutionText, normInstitution, shortForms } from '@darp/shared/institutions';

describe('normInstitution', () => {
  it('makes every way of writing BIT Mesra the same', () => {
    const same = ['BIT Mesra', 'B.I.T. Mesra', 'bit, mesra', 'B. I. T. Mesra'.replace(/\. /g, '.'), 'BIT  Mesra '];
    for (const s of same) expect(normInstitution(s)).toBe('bit mesra');
  });

  it('drops accents and punctuation, and writes & as and', () => {
    expect(normInstitution('Birla Institute of Technology, Mesra')).toBe('birla institute of technology mesra');
    expect(normInstitution('Université de Paris')).toBe('universite de paris');
    expect(normInstitution('A & M University')).toBe('a and m university');
    expect(normInstitution('St. Xavier’s College')).toBe('st xavier s college');
  });

  it('keeps digits and other scripts', () => {
    expect(normInstitution('IIT (ISM) Dhanbad 826004')).toBe('iit ism dhanbad 826004');
    expect(normInstitution('बिरला प्रौद्योगिकी संस्थान')).toContain('बिरला');
  });
});

describe('shortForms', () => {
  it('gives the short name people type', () => {
    expect(shortForms('Indian Institute of Technology, Kharagpur')).toEqual(['iit kharagpur']);
    expect(shortForms('National Institute of Technology Rourkela')).toEqual(['nit rourkela']);
    expect(shortForms('Indian Institute of Information Technology, Allahabad')).toEqual(['iiit allahabad']);
  });
  it('has none for a name without a short form', () => {
    expect(shortForms('Birla Institute of Technology, Mesra')).toEqual([]);
  });
});

describe('institutionText', () => {
  it('is name, state and country, leaving out what the name already says', () => {
    expect(institutionText({ name: 'Birla Institute of Technology, Mesra', state: 'Jharkhand', country: 'India' }))
      .toBe('Birla Institute of Technology, Mesra, Jharkhand, India');
    expect(institutionText({ name: 'University of Texas at Austin, Texas', state: 'Texas', country: 'United States' }))
      .toBe('University of Texas at Austin, Texas, United States');
    expect(institutionText({ name: 'Université de Paris', state: null, country: 'France' })).toBe('Université de Paris, France');
  });
});
