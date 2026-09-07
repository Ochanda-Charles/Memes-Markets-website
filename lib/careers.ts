/**
 * Job applications: what a valid one is, and how to tell.
 *
 *   <CareersForm> ──> /api/careers ──> Apps Script ──┬──> "Applications" tab
 *                                                    └──> a private Drive folder
 *
 * Same shape as lib/partner.ts and for the same reason — the check is pure, so
 * every branch is testable without a network, and the form and the route can run
 * the identical one. The differences are all consequences of a CV being a file:
 * a size that has to be measured before it is trusted, a type that has to be
 * verified against the bytes rather than the label, and a consent tick, because
 * a CV is the most personal thing this site handles and keeping one for a year
 * is not implied by the act of sending it.
 */
import { looksLikeEmail } from "./email";

/**
 * The formats we take, mapped to the extension the Apps Script names the stored
 * file with. This map IS the whitelist: a type that is not a key here is
 * refused, so adding a format means adding a signature below as well.
 */
export const CV_TYPES = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;

export type CvType = keyof typeof CV_TYPES;

/** Bounds. Generous for a person, ungenerous for anyone pasting a payload in. */
export const LIMITS = {
  name: 120,
  email: 320,
  location: 120,
  link: 500,
  message: 4_000,
  /** The CV, in decoded bytes. See MAX_BODY in app/api/careers/route.ts. */
  cvBytes: 2 * 1024 * 1024,
  /** The candidate's own filename. Recorded; never used to name a stored file. */
  cvName: 260,
} as const;

export interface CvUpload {
  /** What the candidate called it. Goes in the row, never on the filesystem. */
  name: string;
  type: CvType;
  /** base64, with no data: prefix. */
  data: string;
}

export interface Application {
  /** "" for a speculative application. Otherwise a slug we published. */
  roleSlug: string;
  name: string;
  email: string;
  location: string;
  link: string;
  message: string;
  cv?: CvUpload;
}

/**
 * NOT `keyof Application`, unlike lib/partner.ts, because two of the things the
 * form marks are not things the sheet stores: `consent` is a gate, and `role` is
 * a slug the server resolves into a title. Deriving the union would leave the
 * form unable to highlight either.
 */
export type ApplicationField =
  | "name"
  | "email"
  | "location"
  | "link"
  | "cv"
  | "message"
  | "consent"
  | "role";

export type ApplicationResult =
  | { ok: true; application: Application }
  | { ok: false; message: string; field?: ApplicationField };

/**
 * The first four base64 characters of each format's file signature.
 *
 *   %PD              -> "JVBE"   PDF
 *   PK, then 0x03    -> "UEsD"   docx, which is a zip
 *   0xD0 0xCF 0x11   -> "0M8R"   doc, an OLE2 compound file
 *
 * Comparing encoded prefixes rather than decoding is exact, not a heuristic:
 * base64 works in independent three-byte groups, so those four characters are a
 * function of those three bytes and nothing else. It also means a 2MB payload is
 * checked by looking at four characters of it.
 *
 * This is the check that matters. A mime type and a filename extension are both
 * just strings the client chose, and a .txt renamed .pdf carries both happily.
 */
const SIGNATURES: Record<CvType, string> = {
  "application/pdf": "JVBE",
  "application/msword": "0M8R",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "UEsD",
};

/**
 * How many bytes a base64 string decodes to, without decoding it.
 *
 * Arithmetic rather than Buffer or atob, so this module stays runtime-agnostic
 * and the test is a function call. Returns NaN for something that is not base64
 * at all, so every comparison against the result is false and the caller has to
 * notice rather than quietly reading a plausible number.
 */
export function base64Bytes(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  const clean = value.replace(/\s/g, "");
  if (clean.length === 0) return 0;
  if (clean.length % 4 !== 0) return Number.NaN;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return Number.NaN;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return (clean.length / 4) * 3 - padding;
}

/** Does the payload actually begin the way this format begins? */
export function looksLikeCv(data: unknown, type: CvType): boolean {
  return typeof data === "string" && data.trimStart().startsWith(SIGNATURES[type]);
}

/**
 * Loose, like looksLikeEmail, and for the same reason: anything stricter turns
 * real links away, and a person reads this one before clicking it. http and
 * https only — the point of the scheme check is that a "javascript:" URL must
 * never end up as a link in the hosts' sheet.
 */
export function looksLikeUrl(value: string): boolean {
  const raw = value.trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  if (/\s/.test(raw)) return false;
  const host = raw.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? "";
  return host.includes(".") && !host.startsWith(".") && !host.endsWith(".");
}

function isCvType(value: unknown): value is CvType {
  return typeof value === "string" && value in CV_TYPES;
}

/**
 * Validate and normalise one application.
 *
 * `openSlugs` comes from the live listing, so a role that closed between the
 * page rendering and the form being submitted is caught here rather than
 * appearing in the sheet as an application for something nobody is hiring for.
 * On an ISR page that race is real, not theoretical.
 *
 * Returns the first problem rather than a list, and in the form's visual order,
 * because the form marks one field at a time and a person fixes them top to
 * bottom — the same argument as lib/partner.ts.
 */
export function validate(
  input: Record<string, unknown>,
  openSlugs: readonly string[],
): ApplicationResult {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const name = text(input.name);
  const email = text(input.email);
  const location = text(input.location);
  const link = text(input.link);
  const message = text(input.message);
  const roleSlug = text(input.roleSlug);

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
  if (location.length > LIMITS.location) {
    return { ok: false, message: "That is too long.", field: "location" };
  }
  if (link && (!looksLikeUrl(link) || link.length > LIMITS.link)) {
    return {
      ok: false,
      message: "That does not look like a link. It needs to start with https://",
      field: "link",
    };
  }

  // A role that has closed since the page was rendered. The message is the whole
  // point of catching it: this person is already writing, and the one thing that
  // keeps them is being told where to put what they have written.
  if (roleSlug && !openSlugs.includes(roleSlug)) {
    return {
      ok: false,
      message: "That role is no longer open. Send us a general application instead.",
      field: "role",
    };
  }

  const raw = input.cv;
  const hasCv = Boolean(raw) && typeof raw === "object";
  let cv: CvUpload | undefined;

  // A CV or a link, at least one. Requiring the file loses the good candidate
  // applying from a phone on a train; requiring neither produces rows nobody can
  // assess. Make the CV mandatory by dropping the `&& !link` here.
  if (!hasCv && !link) {
    return {
      ok: false,
      message: "Attach a CV, or add a link to your work.",
      field: "cv",
    };
  }

  if (hasCv) {
    const file = raw as Record<string, unknown>;
    if (!isCvType(file.type)) {
      return { ok: false, message: "We take PDF or Word documents.", field: "cv" };
    }
    const bytes = base64Bytes(file.data);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return {
        ok: false,
        message: "That file did not upload properly. Try again.",
        field: "cv",
      };
    }
    if (bytes > LIMITS.cvBytes) {
      return {
        ok: false,
        message: "That file is over 2MB. Send a smaller one, or send a link instead.",
        field: "cv",
      };
    }
    if (!looksLikeCv(file.data, file.type)) {
      return {
        ok: false,
        message: "That does not look like a PDF or a Word document.",
        field: "cv",
      };
    }
    cv = {
      name: text(file.name).slice(0, LIMITS.cvName),
      type: file.type,
      data: (file.data as string).replace(/\s/g, ""),
    };
  }

  if (!message) {
    return { ok: false, message: "Tell us a little about yourself.", field: "message" };
  }
  if (message.length > LIMITS.message) {
    return {
      ok: false,
      message: "That is longer than this form takes — email us instead.",
      field: "message",
    };
  }

  // Strictly true. The string "true" is rejected on purpose: FormData stringifies
  // everything, so a refactor that stopped reading .checked would otherwise pass
  // this silently and start keeping CVs nobody agreed to.
  if (input.consent !== true) {
    return {
      ok: false,
      message: "Tick the box so we know we can keep this.",
      field: "consent",
    };
  }

  return {
    ok: true,
    application: { roleSlug, name, email, location, link, message, cv },
  };
}
