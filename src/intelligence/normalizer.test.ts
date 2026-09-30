import { describe, expect, it } from 'vitest';
import { normalizeText, tokenize, tokenizeIdentifier } from './normalizer';

describe('normalizeText', () => {
  it.each([
    ['Full Name', 'full name'],
    ['  Full   Name  ', 'full name'],
    ['Mobile No.', 'mobile number'],
    ['Roll No:', 'roll number'],
    ['No', 'no'],
    ['Yes No', 'yes no'],
    ['D.O.B', 'date of birth'],
    ['D.O.B.', 'date of birth'],
    ['DOB', 'date of birth'],
    ['Date of Birth (DD/MM/YYYY)', 'date of birth dd mm yyyy'],
    ["Father's / Guardian's Name", 'father guardian name'],
    ['Father’s Name', 'father name'],
    ['E-Mail', 'email'],
    ['E Mail ID', 'email id'],
    ['EmailID', 'email id'],
    ['Pin-Code', 'pin code'],
    ['Addr. Line1', 'address line 1'],
    ['Dept.', 'department'],
    ['Aadhar Number', 'aadhaar number'],
    ['Résumé', 'resume'],
    ['applicantFullName', 'applicant full name'],
    ['candidate_legal_name', 'candidate legal name'],
    ['A/C No.', 'ac number'],
    ['10th Marks', '10th marks'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it('handles empty input', () => {
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText('')).toBe('');
  });
});

describe('tokenize', () => {
  it.each([
    ['Please enter your Mobile No.', ['mobile', 'number']],
    ['Name of Candidate', ['name']],
    ['Name as per certificate', ['name', 'certificate']],
    ['Mobile Contact (10 digits)', ['mobile', 'contact', '10']],
    ['Date of Birth (DD/MM/YYYY)', ['date', 'birth']],
    ['Address Line 1', ['address', 'line', '1']],
  ])('%s', (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });
});

describe('tokenizeIdentifier', () => {
  it.each([
    ['ctl00$Main$txtDOB', ['date', 'birth']],
    ['applicant_full_name', ['full', 'name']],
    ['mat-input-3', []],
    ['address_line1', ['address', 'line', '1']],
  ])('%s', (input, expected) => {
    expect(tokenizeIdentifier(input)).toEqual(expected);
  });
});
