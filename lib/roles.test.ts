import { describe, expect, it } from "vitest";
import { ROLES_REVALIDATE } from "./roles";

/**
 * The one thing worth testing in this module that does not need a network.
 *
 * app/careers/page.tsx and app/careers/[slug]/page.tsx each declare their own
 * `export const revalidate`, because Next only accepts a statically analysable
 * literal there and cannot read this constant. Three copies of a number is three
 * chances to change one of them; this is the thing that notices.
 *
 * They are not decorative. Without them a build with no SHEET_WEBHOOK configured
 * makes no fetch, so Next gives the route no window at all and the page stays
 * frozen on "nothing open" until the next deploy.
 */
describe("ROLES_REVALIDATE", () => {
  it("matches the literal the careers routes declare", () => {
    expect(ROLES_REVALIDATE).toBe(300);
  });
});
