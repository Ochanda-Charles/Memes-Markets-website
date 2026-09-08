import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { rolesUrl, sheetEndpoint } from "./sheet";

const SCRIPT = "scripts/sheet-webhook.gs";
const source = readFileSync(SCRIPT, "utf8");

const ENV_KEYS = [
  "SHEET_WEBHOOK",
  "SHEET_SECRET",
  "PARTNER_SHEET_WEBHOOK",
  "PARTNER_SHEET_SECRET",
] as const;

const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("sheetEndpoint", () => {
  it("prefers the SHEET_ names", () => {
    process.env.SHEET_WEBHOOK = "https://script.google.com/new/exec";
    process.env.SHEET_SECRET = "new-secret";
    process.env.PARTNER_SHEET_WEBHOOK = "https://script.google.com/old/exec";
    process.env.PARTNER_SHEET_SECRET = "old-secret";
    expect(sheetEndpoint()).toEqual({
      url: "https://script.google.com/new/exec",
      secret: "new-secret",
    });
  });

  it("falls back to the PARTNER_ names, so an existing deployment keeps working", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.PARTNER_SHEET_WEBHOOK = "https://script.google.com/old/exec";
    process.env.PARTNER_SHEET_SECRET = "old-secret";
    expect(sheetEndpoint()).toEqual({
      url: "https://script.google.com/old/exec",
      secret: "old-secret",
    });
  });

  it("reports no url rather than an empty one when nothing is configured", () => {
    for (const key of ENV_KEYS) delete process.env[key];
    // The routes branch on this to answer 503 rather than posting into the void.
    expect(sheetEndpoint().url).toBeUndefined();
    expect(sheetEndpoint().secret).toBe("");
  });
});

describe("rolesUrl", () => {
  it("asks for the roles list", () => {
    expect(rolesUrl("https://script.google.com/a/exec")).toBe(
      "https://script.google.com/a/exec?list=roles",
    );
  });

  it("does not break a url that already carries a query", () => {
    expect(rolesUrl("https://script.google.com/a/exec?v=2")).toBe(
      "https://script.google.com/a/exec?v=2&list=roles",
    );
  });
});

/**
 * THE APPS SCRIPT IS NOT BUILT, LINTED OR TYPE-CHECKED BY ANYTHING.
 *
 * It is a .gs file that exists to be pasted into someone else's editor, so it
 * sits outside tsconfig, outside Biome's globs and outside the bundler. Nothing
 * in this repo would notice if it stopped being valid JavaScript — and that is
 * not hypothetical: a version of it was committed and pushed with a literal
 * newline inside a string literal, which would have failed to save in the Apps
 * Script editor with an error pointing at a line the person had not written.
 *
 * These two tests are the whole safety net that file has.
 */
describe("scripts/sheet-webhook.gs", () => {
  it("is valid JavaScript", () => {
    // Constructing a Function parses the body without running it, which is
    // exactly what is wanted: DriveApp and SpreadsheetApp do not exist here and
    // are not being tested — the syntax is.
    expect(() => new Function(source)).not.toThrow();
  });

  /**
   * Every function the SETUP block tells a non-developer to pick from the
   * editor's dropdown. Renaming one without amending the instructions sends
   * somebody looking for a menu entry that is not there — which has happened.
   */
  it("defines every function the setup instructions name", () => {
    for (const fn of [
      "doPost",
      "doGet",
      "setupRolesTab",
      "findFolderId",
      "checkSetup",
      "authoriseMe",
    ]) {
      expect(source, `${SCRIPT} should define ${fn}()`).toContain(`function ${fn}(`);
    }
  });

  /**
   * ROLE_HEADERS writes the Roles tab; ROLE_COLUMNS reads it back, keyed on the
   * lowercased header text. Nothing connects them at run time, and a header
   * renamed in one and not the other does not error — it silently drops that
   * column from every listing, so a salary or a location just stops appearing
   * on the live site. This is the only thing holding the two together.
   */
  it("writes exactly the column headers it reads back", () => {
    /** The body of a `const NAME = <open> ... <close>` declaration. */
    const body = (name: string, open: string, close: string) => {
      const after = source.split(`${name} = ${open}`)[1];
      if (after === undefined) throw new Error(`${SCRIPT} no longer declares ${name}`);
      const inner = after.split(close)[0];
      if (inner === undefined) throw new Error(`${name} in ${SCRIPT} is unterminated`);
      return inner;
    };

    const lower = (matches: RegExpMatchArray[]) =>
      matches.map((m) => (m[1] ?? "").toLowerCase());

    const written = lower([...body("ROLE_HEADERS", "[", "];").matchAll(/"([^"]+)"/g)]);
    const read = lower([
      ...body("ROLE_COLUMNS", "{", "};").matchAll(/^\s*"?([\w ]+?)"?:/gm),
    ]);

    expect(written).toHaveLength(15);
    expect(written).toEqual(read);
  });
});
