import type { FormField, PageScanResult } from '../types/formField';

/**
 * Reasons to think twice before filling on this page. Each warning is shown
 * in the popup and makes the user confirm the fill with a second click.
 *
 * `fields` are the fields about to be filled.
 */
export function pageWarnings(scan: PageScanResult, fields: FormField[]): string[] {
  const warnings: string[] = [];

  if (!scan.secureContext) {
    warnings.push('This page isn’t secure (no https). Others on your network could read what you fill in.');
  }

  // Internationalized domain names are stored as "xn--…" (punycode). They're
  // legitimate for many languages, but also used to imitate other sites:
  // "аpple.com" with a Cyrillic "а" becomes "xn--pple-43d.com".
  if (scan.hostname.split('.').some((label) => label.startsWith('xn--'))) {
    warnings.push(`This site’s address (${scan.hostname}) uses special characters. Check it isn’t imitating a site you know.`);
  }

  const otherSites = [...new Set(fields.map((f) => f.submitsTo).filter((host): host is string => Boolean(host)))];
  if (otherSites.length > 0) {
    warnings.push(`This form sends your details to a different website: ${otherSites.join(', ')}.`);
  }

  if (scan.secureContext && fields.some((f) => f.submitsInsecurely)) {
    warnings.push('This form sends your details without encryption (http).');
  }

  return warnings;
}
