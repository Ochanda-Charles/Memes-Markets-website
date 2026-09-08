import { describe, expect, it } from "vitest";
import { redirectedAwayFrom } from "./newsletter";

/**
 * All that is left to test here. The signup is a link now — no form, no route,
 * no address validation, nothing to parse from Substack. What remains is the
 * check that tells the recent-posts strip it is being answered by the wrong
 * host, which is still live and still easy to break.
 */

/**
 * The failure that took the newsletter down at the domain move: the publication
 * still had www.memesandmarkets.com as an enforced custom domain, the site took
 * that domain over, and Substack dutifully redirected the feed onto a Next 404.
 * From a status code alone that is indistinguishable from a quiet newsletter.
 */
describe("redirectedAwayFrom", () => {
  const feed = "https://memesandmarketspod.substack.com/feed";

  it("catches a publication redirecting onto a host that is not Substack", () => {
    expect(redirectedAwayFrom(feed, "https://www.memesandmarkets.com/feed")).toBe(true);
  });

  it("is quiet when nothing redirected", () => {
    expect(redirectedAwayFrom(feed, feed)).toBe(false);
  });

  it("allows Substack to move us around its own hosts", () => {
    for (const landed of [
      "https://substack.com/feed",
      "https://another.substack.com/feed",
    ]) {
      expect(redirectedAwayFrom(feed, landed)).toBe(false);
    }
  });

  it("is not fooled by a lookalike host", () => {
    // endsWith(".substack.com") rather than includes("substack.com").
    expect(redirectedAwayFrom(feed, "https://substack.com.evil.test/feed")).toBe(true);
  });

  it("says nothing rather than throwing on an unparseable url", () => {
    expect(redirectedAwayFrom(feed, "")).toBe(false);
    expect(redirectedAwayFrom("", feed)).toBe(false);
  });
});
