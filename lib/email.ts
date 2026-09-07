/**
 * One loose email test, shared by the two forms on the site.
 *
 * It lived in lib/partner.ts, whose comment said "same loose test as the
 * newsletter" — true when the newsletter had its own copy, and left dangling
 * when that copy went with the signup form. The signup posts again now, so
 * rather than reinstate the second copy the one that survived moved here.
 *
 * Deliberately permissive: one @, something either side, a dot in the domain.
 * Anything stricter turns real addresses away, and both callers have something
 * behind them that checks properly — Substack for the newsletter, a person
 * reading the sheet for partnerships.
 */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
