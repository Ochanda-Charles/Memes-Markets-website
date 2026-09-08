/**
 * Job listings as they arrive from the sheet: the types, and the parser.
 *
 * Split out from roles.ts for exactly the reason channel.ts is split out from
 * stats.ts, and the reason is worth restating rather than cross-referencing.
 * roles.ts imports the committed fallback JSON, and a JSON import without an
 * import attribute cannot be loaded by plain Node — so scripts/refresh-roles.mjs
 * cannot import anything that reaches roles.ts. Without this file the script
 * would need its own copy of the parser, and a job running a different parser
 * proves nothing about what the site can read.
 *
 * THIS FILE IMPORTS NOTHING AT ALL. Node's ESM resolver rejects a relative
 * import without a file extension, so even `from "./sheet"` would fail here
 * under the script with ERR_MODULE_NOT_FOUND.
 *
 * WHERE THE WORK IS DIVIDED. The Apps Script maps sheet columns onto the keys
 * below and drops Draft rows; everything after that — slugs, list splitting,
 * status coercion, de-duplication — happens here, where it is unit-tested.
 * Logic in the Apps Script is logic nobody can run a test against.
 */

export const ROLE_STATUSES = ["Open", "Closed", "Draft"] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Freelance",
  "Internship",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const REMOTE_POLICIES = ["Remote", "Hybrid", "On-site"] as const;
export type RemotePolicy = (typeof REMOTE_POLICIES)[number];

export interface Role {
  /** The URL. Derived from the title unless the sheet pins one. */
  slug: string;
  title: string;
  team: string;
  location: string;
  remote: RemotePolicy;
  employment: EmploymentType;
  /**
   * Free text on purpose: "£45,000–£55,000", "Day rate, negotiable". Anything
   * structured enough for search results needs its own columns — see the note
   * on baseSalary in lib/schema.tsx.
   */
  compensation: string;
  status: RoleStatus;
  /** YYYY-MM-DD, or "" when the sheet cell was empty or unreadable. */
  posted: string;
  /** YYYY-MM-DD, or "" for open until filled. */
  closes: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  process: string[];
}

/** Longer than this is a paragraph pasted into the title cell, not a title. */
const MAX_SLUG = 60;

/**
 * A title into a URL segment.
 *
 * The diacritic strip matters more than it looks: "Rédacteur" without it becomes
 * "r-dacteur", which is not a URL anybody would type or trust. Ampersands go the
 * same way as any other punctuation, which on this show is not a rare case.
 */
export function slugify(value: string): string {
  return (
    String(value ?? "")
      .normalize("NFKD")
      // \p{Diacritic} rather than the \u0300-\u036f range: NFKD leaves the
      // combining marks behind as their own characters, and a character class
      // spanning them is the thing noMisleadingCharacterClass is warning about.
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_SLUG)
      .replace(/-+$/g, "")
  );
}

/**
 * One multi-line sheet cell into list items.
 *
 * Whoever fills the sheet in will sometimes type their own bullets, because a
 * list looks like a list. Stripping a leading marker means "- Cut the show" and
 * "Cut the show" render identically rather than one of them growing a second
 * bullet in front of the one the page draws.
 */
export function toLines(value: unknown): string[] {
  // Only a string, for the same reason text() below only takes a string: a
  // number sitting in the cell is a sheet somebody has broken, and coercing it
  // prints "42" on a job listing as though it were a requirement.
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s+/, "").trim())
    .filter(Boolean);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A date cell to YYYY-MM-DD, or "".
 *
 * Sheets hands a date back in whatever the script serialised it as, and a cell
 * somebody typed by hand may be anything at all. Only the two shapes we can be
 * certain about are accepted; a date printed wrong on a job listing is worse
 * than one left off it.
 */
function toDate(value: unknown): string {
  const raw = text(value);
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(raw);
  return match?.[1] ?? "";
}

/**
 * Coerce one of a closed set, case-insensitively, or fall back.
 *
 * Case-insensitive because a dropdown in Sheets is a suggestion, not a
 * constraint — somebody will paste "open" into the cell eventually.
 */
function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const raw = text(value).toLowerCase();
  return allowed.find((option) => option.toLowerCase() === raw) ?? fallback;
}

/**
 * Read whatever the endpoint returned into roles. Never throws.
 *
 * FAILS CLOSED ON STATUS, AND ONLY ON STATUS. An unrecognised employment type
 * or remote policy falls back to the commonest value, because getting one of
 * those wrong prints a slightly wrong word on a page. An unrecognised status
 * falls back to Draft, which hides the listing entirely — because getting that
 * one wrong publishes a role that was not ready. A typo in the status column
 * should cost somebody a puzzled minute, never an accidental posting.
 */
export function parseRoles(body: unknown): Role[] {
  const rows = (body as { roles?: unknown })?.roles;
  if (!Array.isArray(rows)) return [];

  const roles: Role[] = [];
  const taken = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const cell = row as Record<string, unknown>;

    const title = text(cell.title);
    // A blank row at the bottom of a sheet is normal. It must not become a role
    // called "Untitled" sitting at /careers/.
    if (!title) continue;

    const wanted = slugify(text(cell.slug) || title);
    if (!wanted) continue;

    // Two roles called "Producer" must not both own /careers/producer, with one
    // of them silently unreachable. Sheet order decides who keeps the short one.
    let slug = wanted;
    for (let n = 2; taken.has(slug); n++) slug = `${wanted}-${n}`;
    taken.add(slug);

    roles.push({
      slug,
      title,
      team: text(cell.team),
      location: text(cell.location),
      remote: oneOf(cell.remote, REMOTE_POLICIES, "On-site"),
      employment: oneOf(cell.type, EMPLOYMENT_TYPES, "Full-time"),
      compensation: text(cell.compensation),
      status: oneOf(cell.status, ROLE_STATUSES, "Draft"),
      posted: toDate(cell.posted),
      closes: toDate(cell.closes),
      summary: text(cell.summary),
      responsibilities: toLines(cell.responsibilities),
      requirements: toLines(cell.requirements),
      niceToHave: toLines(cell.niceToHave),
      process: toLines(cell.process),
    });
  }

  // The script already drops these. Doing it again costs one line and means a
  // half-deployed script cannot leak an unfinished listing onto the site.
  return roles.filter((role) => role.status !== "Draft");
}

export function openRoles(roles: readonly Role[]): Role[] {
  return roles.filter((role) => role.status === "Open");
}

/** Exact match. A URL is a URL; /careers/Producer is not /careers/producer. */
export function findRole(roles: readonly Role[], slug: string): Role | undefined {
  return roles.find((role) => role.slug === slug);
}
