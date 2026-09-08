/**
 * One loose email test, shared by the two forms on the site.
 *
 * It lived in lib/partner.ts under a comment reading "same loose test as the
 * newsletter", which was true while the newsletter had a copy of its own. The
 * newsletter is a link to Substack now and has no form to check anything in, so
 * that copy is gone — but the careers form arrived needing the same test, and
 * two callers is what makes a shared one worth having rather than a second
 * duplicate.
 *
 * Deliberately permissive: one @, something either side, a dot in the domain.
 * Anything stricter turns real addresses away, and both callers have a person
 * reading the sheet behind them who can tell a typo from an address.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
