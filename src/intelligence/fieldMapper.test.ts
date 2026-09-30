import { describe, expect, it } from 'vitest';
import { createEmptyProfile } from '../profiles/profileManager';
import type { UserProfile } from '../profiles/profileTypes';
import type { FormField } from '../types/formField';
import { mapField } from './fieldMapper';
import { fieldSignature } from './fieldSignature';

let counter = 0;
function field(overrides: Partial<FormField>): FormField {
  counter++;
  return {
    elementId: `fp-${counter}`,
    tagName: 'input',
    type: 'text',
    labelSource: overrides.label ? 'label' : 'none',
    required: false,
    readOnly: false,
    sensitive: false,
    formIndex: 0,
    ...overrides,
  };
}

function profile(): UserProfile {
  const p = createEmptyProfile('Test');
  p.personal = { fullName: 'Asha Kumar', dateOfBirth: '2004-03-15', gender: 'Female', parentGuardianName: 'Ravi Kumar' };
  p.contact = { email: 'asha@example.com', phone: '+91 98765 43210' };
  p.currentAddress = { line1: '12 Lake Rd', city: 'Chennai', state: 'Tamil Nadu', pincode: '600040' };
  p.permanentAddress = { line1: '4 Temple St', city: 'Madurai', state: 'Tamil Nadu', pincode: '625001' };
  p.customFields = [{ id: 'c1', label: 'Aadhaar', value: '1234 5678 9012', sensitive: true }];
  return p;
}

describe('mapField: basic matching', () => {
  it.each<[Partial<FormField>, string]>([
    [{ label: 'Full Name', name: 'fullName' }, 'personal.fullName'],
    [{ label: 'Email', type: 'email' }, 'contact.email'],
    [{ label: 'Phone', type: 'tel' }, 'contact.phone'],
    [{ label: 'Electronic Mail Address', type: 'email' }, 'contact.email'],
    [{ label: 'Mail ID', labelSource: 'aria-labelledby', type: 'email' }, 'contact.email'],
    [{ label: 'Contact Number', labelSource: 'placeholder', placeholder: 'Contact Number', type: 'tel' }, 'contact.phone'],
    [{ ariaLabel: 'Candidate Name', label: 'Candidate Name', labelSource: 'aria-label' }, 'personal.fullName'],
    [{ label: "Father's / Guardian's Name", labelSource: 'nearby-text' }, 'personal.parentGuardianName'],
    [{ label: 'Name of Candidate', labelSource: 'nearby-text' }, 'personal.fullName'],
    [{ autocomplete: 'email', name: 'x1' }, 'contact.email'],
  ])('%o → %s', (overrides, expected) => {
    const result = mapField(field(overrides), profile());
    expect(result.target).toBe(expected);
    expect(result.level).toBe('high');
  });

  it('matches custom fields and keeps them sensitive', () => {
    const result = mapField(field({ label: 'Aadhaar Number', sensitive: true }), profile());
    expect(result.target).toBe('custom:c1');
    expect(result.sensitive).toBe(true);
  });

  it('asks for confirmation when only the programmer name identifies the field', () => {
    const result = mapField(field({ label: 'applicant full name', labelSource: 'name', name: 'applicant_full_name' }), profile());
    expect(result.target).toBe('personal.fullName');
    expect(result.level).toBe('medium');
  });

  it('reports no match instead of guessing', () => {
    const result = mapField(field({ label: 'Statement of purpose', type: 'textarea' }), profile());
    expect(result.target).toBeNull();
    expect(result.unavailable).toBe('no-match');
  });

  it('ignores meaningless ids', () => {
    expect(mapField(field({ id: 'mat-input-3' }), profile()).unavailable).toBe('no-match');
  });

  it('does not map school-level education rows to college', () => {
    expect(mapField(field({ label: 'Board / University (SSLC)', labelSource: 'nearby-text' }), profile()).target).toBeNull();
  });
});

describe('mapField: context', () => {
  it('uses the section to pick permanent vs current address', () => {
    const permanent = mapField(field({ label: 'City', sectionHeading: 'Permanent Address' }), profile());
    const current = mapField(field({ label: 'City', sectionHeading: 'Current Address' }), profile());
    expect(permanent.target).toBe('permanentAddress.city');
    expect(permanent.displayValue).toBe('Madurai');
    expect(current.target).toBe('currentAddress.city');
    expect(current.level).toBe('high');
  });

  it('lowers confidence when the address type is unknown and the addresses differ', () => {
    const result = mapField(field({ label: 'City', sectionHeading: 'Test 5' }), profile());
    expect(result.target).toBe('currentAddress.city');
    expect(result.level).toBe('medium');
  });

  it('is confident when both addresses agree', () => {
    const result = mapField(field({ label: 'State' }), profile());
    expect(result.level).toBe('high');
  });

  it('refuses other people’s details', () => {
    const result = mapField(field({ label: 'Name', sectionHeading: 'Emergency Contact' }), profile());
    expect(result.unavailable).toBe('other-person');
  });

  it('lets a visible label veto a concept even when the id matches it', () => {
    const result = mapField(field({ label: 'Emergency Phone', id: 'em-phone', type: 'tel' }), profile());
    expect(result.target).toBeNull();
  });

  it('does not let programmer ids veto a clear label', () => {
    expect(mapField(field({ label: 'Full Name', name: 'user_full_name' }), profile()).target).toBe('personal.fullName');
  });

  it('reads "Name" under a guardian section as the guardian’s name', () => {
    const result = mapField(field({ label: 'Name', sectionHeading: 'Parent / Guardian details' }), profile());
    expect(result.target).toBe('personal.parentGuardianName');
  });
});

describe('mapField: values', () => {
  it('formats dates the way the field asks', () => {
    const result = mapField(field({ label: 'Date of Birth (DD/MM/YYYY)', labelSource: 'nearby-text', name: 'ctl00$Main$txtDOB' }), profile());
    expect(result.target).toBe('personal.dateOfBirth');
    expect(result.value).toBe('15/03/2004');
    expect(result.level).toBe('high');
  });

  it('keeps ISO dates for type=date', () => {
    expect(mapField(field({ label: 'Date of birth', type: 'date' }), profile()).value).toBe('2004-03-15');
  });

  it('picks the matching radio option value', () => {
    const result = mapField(
      field({ label: 'Gender', type: 'radio', options: [{ value: 'M', text: 'Male' }, { value: 'F', text: 'Female' }] }),
      profile(),
    );
    expect(result.value).toBe('F');
    expect(result.displayValue).toBe('Female');
  });

  it('fits phone numbers to maxlength', () => {
    const result = mapField(field({ label: 'Mobile Contact (10 digits)', type: 'tel', maxLength: 10 }), profile());
    expect(result.value).toBe('9876543210');
  });

  it('falls back from certificate name to full name, with medium confidence', () => {
    const result = mapField(field({ label: 'Name as per certificate', labelSource: 'nearby-text' }), profile());
    expect(result.target).toBe('personal.fullName');
    expect(result.level).toBe('medium');
  });

  it('marks missing values as unavailable', () => {
    const result = mapField(field({ label: 'Skills', type: 'textarea' }), profile());
    expect(result.target).toBe('education.skills');
    expect(result.unavailable).toBe('no-value');
  });

  it('never fills read-only fields', () => {
    expect(mapField(field({ label: 'Full Name', readOnly: true }), profile()).unavailable).toBe('read-only');
  });

  it('never puts profile values into reasons', () => {
    const p = profile();
    const values = ['Asha Kumar', 'asha@example.com', 'Chennai', 'Madurai', '9876543210', '1234 5678 9012'];
    for (const label of ['Full Name', 'Email', 'City', 'Mobile', 'Aadhaar Number']) {
      const reasons = mapField(field({ label }), p).reasons.join(' ');
      for (const value of values) expect(reasons).not.toContain(value);
    }
  });
});

describe('mapField: correction memory', () => {
  it('uses a remembered choice', () => {
    const f = field({ label: 'Applicant', name: 'appl' });
    const result = mapField(f, profile(), { hostname: 'example.com', memory: { [fieldSignature(f)]: 'personal.fullName' } });
    expect(result.target).toBe('personal.fullName');
    expect(result.source).toBe('memory');
    expect(result.level).toBe('high');
  });

  it('respects a remembered "don’t fill"', () => {
    const f = field({ label: 'Full Name' });
    const result = mapField(f, profile(), { memory: { [fieldSignature(f)]: 'ignore' } });
    expect(result.unavailable).toBe('ignored');
  });
});
