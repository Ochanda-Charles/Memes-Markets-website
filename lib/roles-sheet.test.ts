import { describe, expect, it } from "vitest";
import { findRole, openRoles, parseRoles, slugify, toLines } from "./roles-sheet";

/** One row in the shape the Apps Script emits. Spread and override per case. */
const ROW = {
  slug: "",
  title: "Associate Producer",
  team: "Production",
  location: "London",
  remote: "Hybrid",
  type: "Full-time",
  compensation: "£38,000–£45,000",
  status: "Open",
  posted: "2026-09-01",
  closes: "",
  summary: "Cut the show, book the guests, keep Tuesday from becoming Wednesday.",
  responsibilities: "Edit the live show\n- Book guests",
  requirements: "Two years in production",
  niceToHave: "",
  process: "A call\nA trial edit",
};

const rows = (...overrides: Partial<typeof ROW>[]) => ({
  roles: overrides.map((o) => ({ ...ROW, ...o })),
});

describe("slugify", () => {
  it("makes an ordinary title into a URL segment", () => {
    expect(slugify("Associate Producer")).toBe("associate-producer");
  });

  it("treats an ampersand as punctuation, which on this show is not rare", () => {
    expect(slugify("Head of Memes & Markets")).toBe("head-of-memes-markets");
  });

  it("strips diacritics rather than dropping the letters under them", () => {
    // Without the NFKD strip this is "r-dacteur", which is not a URL anyone
    // would type or trust.
    expect(slugify("Rédacteur")).toBe("redacteur");
  });

  it("collapses runs and trims the edges", () => {
    expect(slugify("  Senior --- Editor!!  ")).toBe("senior-editor");
  });

  it("returns nothing at all for a title with no letters in it", () => {
    // parseRoles drops the row rather than publishing /careers/.
    expect(slugify("!!! ???")).toBe("");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(58)} bbbbb`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("toLines", () => {
  it("splits a multi-line cell, trims, and drops the blanks", () => {
    expect(toLines("Edit the show\n\n  Book guests  \n")).toEqual([
      "Edit the show",
      "Book guests",
    ]);
  });

  it("handles the carriage returns a Windows paste brings with it", () => {
    expect(toLines("One\r\nTwo")).toEqual(["One", "Two"]);
  });

  it("strips bullets somebody typed, so the page does not draw a second one", () => {
    expect(toLines("- One\n• Two\n* Three")).toEqual(["One", "Two", "Three"]);
  });

  it("keeps a hyphen that is part of the sentence", () => {
    expect(toLines("Day-to-day editing")).toEqual(["Day-to-day editing"]);
  });

  it("says nothing rather than throwing on junk", () => {
    for (const junk of [null, undefined, 42, {}]) {
      expect(toLines(junk)).toEqual([]);
    }
  });
});

describe("parseRoles", () => {
  it("reads a complete row", () => {
    const [role] = parseRoles(rows({}));
    expect(role).toMatchObject({
      slug: "associate-producer",
      title: "Associate Producer",
      remote: "Hybrid",
      employment: "Full-time",
      status: "Open",
      posted: "2026-09-01",
      closes: "",
      responsibilities: ["Edit the live show", "Book guests"],
      niceToHave: [],
    });
  });

  it("prefers a slug the sheet pins over the one derived from the title", () => {
    // So a title edit does not break every link already sent out.
    const [role] = parseRoles(rows({ slug: "producer", title: "Associate Producer" }));
    expect(role?.slug).toBe("producer");
  });

  it("gives two roles of the same name different URLs, in sheet order", () => {
    const parsed = parseRoles(rows({ title: "Producer" }, { title: "Producer" }));
    expect(parsed.map((r) => r.slug)).toEqual(["producer", "producer-2"]);
  });

  it("drops a row with no title, because a blank trailing row is normal", () => {
    expect(parseRoles(rows({ title: "" }, { title: "   " }))).toEqual([]);
  });

  it("drops a title that slugifies to nothing rather than publishing /careers/", () => {
    expect(parseRoles(rows({ title: "!!!" }))).toEqual([]);
  });

  /**
   * THE LOAD-BEARING TEST IN THIS FILE.
   *
   * Every other coercion here falls back to the commonest value, because getting
   * an employment type wrong prints a slightly wrong word. Getting a status
   * wrong publishes a role that was not ready — so status, and only status,
   * fails closed. Change this and a typo in one spreadsheet cell puts an
   * unfinished listing on the internet.
   */
  it("hides a role whose status it does not recognise", () => {
    for (const status of ["", "open ish", "OPEN?", "Live"]) {
      expect(parseRoles(rows({ status }))).toEqual([]);
    }
  });

  it("drops Draft rows even when the script has already dropped them", () => {
    expect(parseRoles(rows({ status: "Draft" }))).toEqual([]);
  });

  it("accepts a status in whatever case somebody typed it", () => {
    expect(parseRoles(rows({ status: "open" }))[0]?.status).toBe("Open");
  });

  it("falls back to the commonest value for type and remote policy", () => {
    const [role] = parseRoles(rows({ type: "Freelance-ish", remote: "wherever" }));
    expect(role).toMatchObject({ employment: "Full-time", remote: "On-site" });
  });

  it("takes only a date it can be certain about", () => {
    expect(parseRoles(rows({ posted: "2026-09-01T00:00:00.000Z" }))[0]?.posted).toBe(
      "2026-09-01",
    );
    for (const bad of ["1 September 2026", "09/01/2026", "soon", ""]) {
      expect(parseRoles(rows({ posted: bad }))[0]?.posted).toBe("");
    }
  });

  it("returns nothing rather than throwing on a body of the wrong shape", () => {
    for (const junk of [
      null,
      undefined,
      "x",
      42,
      {},
      { roles: "no" },
      { roles: [null, 7] },
    ]) {
      expect(parseRoles(junk)).toEqual([]);
    }
  });
});

describe("openRoles and findRole", () => {
  it("lists only what is open", () => {
    const parsed = parseRoles(
      rows({ title: "One", status: "Open" }, { title: "Two", status: "Closed" }),
    );
    expect(openRoles(parsed).map((r) => r.title)).toEqual(["One"]);
  });

  it("finds a closed role too — its page is a page, not a 404", () => {
    const parsed = parseRoles(rows({ title: "Two", status: "Closed" }));
    expect(findRole(parsed, "two")?.status).toBe("Closed");
  });

  it("matches a slug exactly, because a URL is a URL", () => {
    const parsed = parseRoles(rows({ title: "Producer" }));
    expect(findRole(parsed, "Producer")).toBeUndefined();
    expect(findRole(parsed, "producer")).toBeDefined();
  });
});
