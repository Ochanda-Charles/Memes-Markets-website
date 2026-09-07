import { describe, expect, it } from "vitest";
import { LIMITS, base64Bytes, looksLikeCv, looksLikeUrl, validate } from "./careers";

/** "%PDF-1.4\n" — a real signature, small enough to type. */
const PDF = "JVBERi0xLjQK";
const DOCX = "UEsDBBQABgAI";

const GOOD = {
  roleSlug: "associate-producer",
  name: "Sam Rivera",
  email: "sam@example.co.uk",
  location: "Manchester",
  link: "https://example.com/sam",
  message: "I cut the last three seasons of a daily markets show.",
  consent: true,
};

const OPEN = ["associate-producer", "clips-editor"];

/** A base64 string of a given decoded size, without allocating megabytes. */
const base64OfBytes = (bytes: number, prefix = PDF) => {
  const groups = Math.ceil(bytes / 3);
  const padded = prefix + "A".repeat(groups * 4 - prefix.length);
  const over = groups * 3 - bytes;
  return over === 0 ? padded : padded.slice(0, -over) + "=".repeat(over);
};

describe("base64Bytes", () => {
  it("counts what a string decodes to, padding included", () => {
    expect(base64Bytes("")).toBe(0);
    expect(base64Bytes("AAAA")).toBe(3);
    expect(base64Bytes("AAA=")).toBe(2);
    expect(base64Bytes("AA==")).toBe(1);
  });

  it("ignores whitespace, which a wrapped payload arrives with", () => {
    expect(base64Bytes("AAAA\nAAAA")).toBe(6);
  });

  /**
   * NaN rather than a number, so `bytes > LIMITS.cvBytes` is false, `bytes <=`
   * is false, and every branch that could wave junk through has to look at it
   * on purpose. A plausible-looking wrong number is the failure to avoid here.
   */
  it("is NaN for something that is not base64 at all", () => {
    for (const junk of ["AAA", "!!!!", "AB CD!", 42, null, undefined, {}]) {
      expect(base64Bytes(junk)).toBeNaN();
    }
  });

  it("builds the sizes this file's own bound tests rely on", () => {
    expect(base64Bytes(base64OfBytes(LIMITS.cvBytes))).toBe(LIMITS.cvBytes);
    expect(base64Bytes(base64OfBytes(LIMITS.cvBytes + 1))).toBe(LIMITS.cvBytes + 1);
  });
});

describe("looksLikeCv", () => {
  it("recognises each format by its own signature", () => {
    expect(looksLikeCv(PDF, "application/pdf")).toBe(true);
    expect(
      looksLikeCv(
        DOCX,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  /**
   * THE LOAD-BEARING TEST IN THIS FILE.
   *
   * A mime type and a filename extension are both strings the client chose, and
   * a .txt renamed .pdf carries both happily. This is the only thing standing
   * between the hosts' Drive folder and whatever somebody felt like uploading.
   */
  it("is not fooled by a payload claiming the wrong format", () => {
    expect(
      looksLikeCv(
        PDF,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(false);
    expect(looksLikeCv(DOCX, "application/pdf")).toBe(false);
    // "hello world" — a text file with a .pdf on the end of its name.
    for (const type of ["application/pdf", "application/msword"] as const) {
      expect(looksLikeCv("aGVsbG8gd29ybGQ=", type)).toBe(false);
    }
  });

  it("does not throw on junk", () => {
    for (const junk of [null, undefined, 42, {}]) {
      expect(looksLikeCv(junk, "application/pdf")).toBe(false);
    }
  });
});

describe("looksLikeUrl", () => {
  it("accepts the shapes a real portfolio link takes", () => {
    for (const good of [
      "https://example.com",
      "http://example.co.uk/sam?ref=1",
      "https://www.linkedin.com/in/sam-rivera/",
    ]) {
      expect(looksLikeUrl(good)).toBe(true);
    }
  });

  it("refuses anything that is not http, so no javascript: reaches the sheet", () => {
    for (const bad of [
      "javascript:alert(1)",
      "ftp://example.com",
      "example.com",
      "https://example",
      "https://exa mple.com",
      "",
    ]) {
      expect(looksLikeUrl(bad)).toBe(false);
    }
  });
});

describe("validate", () => {
  it("accepts a complete application and trims what it returns", () => {
    const result = validate({ ...GOOD, name: "  Sam Rivera  " }, OPEN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("a complete application was refused");
    expect(result.application.name).toBe("Sam Rivera");
    expect(result.application.roleSlug).toBe("associate-producer");
  });

  it("accepts a speculative application, which has no role at all", () => {
    const result = validate({ ...GOOD, roleSlug: "" }, OPEN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("a speculative application was refused");
    expect(result.application.roleSlug).toBe("");
  });

  /**
   * The role closed between the page rendering and this being submitted. A real
   * race on an ISR page — and the message, not the rejection, is the point.
   */
  it("names the role field when the role is no longer open", () => {
    expect(validate({ ...GOOD, roleSlug: "gone" }, OPEN)).toMatchObject({
      ok: false,
      field: "role",
    });
  });

  it("wants a CV or a link, and is happy with either alone", () => {
    expect(validate({ ...GOOD, link: "" }, OPEN)).toMatchObject({
      ok: false,
      field: "cv",
    });
    expect(validate({ ...GOOD, link: "https://example.com/sam" }, OPEN).ok).toBe(true);
    expect(
      validate(
        { ...GOOD, link: "", cv: { name: "cv.pdf", type: "application/pdf", data: PDF } },
        OPEN,
      ).ok,
    ).toBe(true);
  });

  it("takes a CV right up to the bound and refuses one byte past it", () => {
    const cv = (bytes: number) => ({
      ...GOOD,
      cv: { name: "cv.pdf", type: "application/pdf", data: base64OfBytes(bytes) },
    });
    expect(validate(cv(LIMITS.cvBytes), OPEN).ok).toBe(true);
    expect(validate(cv(LIMITS.cvBytes + 1), OPEN)).toMatchObject({
      ok: false,
      field: "cv",
    });
  });

  it("refuses a format it does not take, even with a real payload behind it", () => {
    expect(
      validate({ ...GOOD, cv: { name: "cv.txt", type: "text/plain", data: PDF } }, OPEN),
    ).toMatchObject({ ok: false, field: "cv" });
  });

  it("refuses a file whose bytes disagree with its label", () => {
    expect(
      validate(
        {
          ...GOOD,
          cv: { name: "cv.pdf", type: "application/pdf", data: "aGVsbG8gd29ybGQ=" },
        },
        OPEN,
      ),
    ).toMatchObject({ ok: false, field: "cv" });
  });

  it("refuses a CV that did not encode properly", () => {
    for (const data of ["", "AAA", "!!!!"]) {
      expect(
        validate(
          { ...GOOD, cv: { name: "cv.pdf", type: "application/pdf", data } },
          OPEN,
        ),
      ).toMatchObject({ ok: false, field: "cv" });
    }
  });

  /**
   * The string "true" matters. FormData stringifies everything, so a refactor
   * that stopped reading .checked would pass a truthy string here — and start
   * keeping CVs nobody agreed to, silently.
   */
  it("requires consent to be the boolean, not something merely truthy", () => {
    for (const consent of [false, "true", "on", 1, undefined, null]) {
      expect(validate({ ...GOOD, consent }, OPEN)).toMatchObject({
        ok: false,
        field: "consent",
      });
    }
  });

  it("names the field that is wrong, so the form can mark it", () => {
    expect(validate({ ...GOOD, name: "  " }, OPEN)).toMatchObject({ field: "name" });
    expect(validate({ ...GOOD, email: "nope" }, OPEN)).toMatchObject({ field: "email" });
    expect(validate({ ...GOOD, link: "nope" }, OPEN)).toMatchObject({ field: "link" });
    expect(validate({ ...GOOD, message: "" }, OPEN)).toMatchObject({ field: "message" });
  });

  it("bounds every free-text field, and accepts each right up to the bound", () => {
    for (const field of ["name", "location", "message"] as const) {
      expect(validate({ ...GOOD, [field]: "a".repeat(LIMITS[field] + 1) }, OPEN).ok).toBe(
        false,
      );
      expect(validate({ ...GOOD, [field]: "a".repeat(LIMITS[field]) }, OPEN).ok).toBe(
        true,
      );
    }
  });

  it("does not throw on a body of the wrong shape entirely", () => {
    for (const junk of [
      {},
      { name: 1, email: [], cv: [] },
      { ...GOOD, cv: { data: 7 } },
      { ...GOOD, cv: { type: "application/pdf" } },
    ]) {
      expect(validate(junk as Record<string, unknown>, OPEN).ok).toBe(false);
    }
  });
});
