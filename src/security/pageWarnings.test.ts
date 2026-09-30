import { describe, expect, it } from 'vitest';
import type { FormField, PageScanResult } from '../types/formField';
import { pageWarnings } from './pageWarnings';

const scan = (overrides: Partial<PageScanResult> = {}): PageScanResult => ({
  hostname: 'example.com', fields: [], skipped: {}, iframeCount: 0, secureContext: true, ...overrides,
});
const field = (overrides: Partial<FormField> = {}): FormField => ({
  elementId: 'fp-1', tagName: 'input', type: 'text', labelSource: 'label', required: false, readOnly: false,
  sensitive: false, formIndex: 0, ...overrides,
});

describe('pageWarnings', () => {
  it('is quiet for a normal https page', () => {
    expect(pageWarnings(scan(), [field()])).toEqual([]);
  });

  it('warns on http pages', () => {
    expect(pageWarnings(scan({ secureContext: false }), [field()])[0]).toMatch(/isn’t secure/);
  });

  it('warns on punycode lookalike domains', () => {
    expect(pageWarnings(scan({ hostname: 'xn--pple-43d.com' }), [])[0]).toMatch(/special characters/);
  });

  it('names other sites the form submits to, once each', () => {
    const warnings = pageWarnings(scan(), [field({ submitsTo: 'collect.evil.test' }), field({ submitsTo: 'collect.evil.test' })]);
    expect(warnings).toEqual(['This form sends your details to a different website: collect.evil.test.']);
  });

  it('warns about http form targets on an https page', () => {
    expect(pageWarnings(scan(), [field({ submitsInsecurely: true })])[0]).toMatch(/without encryption/);
  });
});
