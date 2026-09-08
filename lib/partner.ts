/**
 * The partnership / sponsorship enquiry form.
 *
 *   <PartnerForm> ──> /api/partner ──> Apps Script web app ──> Google Sheet
 *
 * WHY IT GOES THROUGH OUR OWN ROUTE. The Apps Script URL is a public write
 * endpoint: anyone holding it can append rows to the sheet forever. Posting to
 * it from the browser would put it in the page source of every visitor. Keeping
 * it server-side means the only thing on the public internet is /api/partner,
 * which is rate-limited and origin-checked, and rotating the script URL is an
 * env var change rather than a redeploy of the client bundle.
 *
 * It is also why the form is not a Google Form in an iframe: that would work
 * with no code at all, but it cannot be styled, it drops a third-party frame on
 * the site, and it sends the one audience the site most wants to impress —
 * sponsors — to a page that looks nothing like the show.
 */
import { looksLikeEmail } from "./email";

export const ENQUIRY_KINDS = [
  "Sponsorship",
  "Partnership",
  "Guest pitch",
  "Press",
  "Something else",
] as const;

export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

export interface Enquiry {
  name: string;
  email: string;
  organisation: string;
  kind: EnquiryKind;
  message: string;
}

export type EnquiryResult =
  | { ok: true }
  | { ok: false; message: string; field?: keyof Enquiry };

/** Bounds. Generous for a person, ungenerous for anyone pasting a payload in. */
export const LIMITS = {
  name: 120,
  email: 320,
  organisation: 160,
  message: 4_000,
} as const;

function isKind(value: unknown): value is EnquiryKind {
  return ENQUIRY_KINDS.includes(value as EnquiryKind);
}

/**
 * Validate and normalise one submission. Pure, so every branch is testable
 * without a network — lib/partner.test.ts.
 *
 * Returns the first problem rather than a list. The form marks one field at a
 * time and a person fixes them one at a time; a wall of five errors under a
 * five-field form is not more helpful for being complete.
 */
export function validate(input: Record<string, unknown>): EnquiryResult & {
  enquiry?: Enquiry;
} {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const name = text(input.name);
  const email = text(input.email);
  const organisation = text(input.organisation);
  const message = text(input.message);
  const kind = input.kind;

  if (!name) return { ok: false, message: "Please add your name.", field: "name" };
  if (name.length > LIMITS.name) {
    return { ok: false, message: "That name is too long.", field: "name" };
  }
  if (!looksLikeEmail(email) || email.length > LIMITS.email) {
    return {
      ok: false,
      message: "That does not look like an email address.",
      field: "email",
    };
  }
  if (organisation.length > LIMITS.organisation) {
    return { ok: false, message: "That is too long.", field: "organisation" };
  }
  if (!isKind(kind)) {
    return { ok: false, message: "Pick what this is about.", field: "kind" };
  }
  if (!message) {
    return { ok: false, message: "Tell us a little about it.", field: "message" };
  }
  if (message.length > LIMITS.message) {
    return {
      ok: false,
      message: "That is longer than this form takes — email us instead.",
      field: "message",
    };
  }

  return { ok: true, enquiry: { name, email, organisation, kind, message } };
}
