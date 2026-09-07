import { describe, expect, it } from "vitest";
import {
  pointsAtSelf,
  redirectedAwayFrom,
  subscribeBody,
  subscribeEndpoint,
  validateSubscriber,
} from "./newsletter";

/**
 * The signup posts from the browser again, so there is real logic here to cover:
 * the address check that has to be right because Substack's rejection is
 * invisible to us, and the body shape that is the whole reason the request gets
 * through at all.
 */

/**
 * THE LOAD-BEARING TEST IN THIS FILE.
 *
 * A URLSearchParams body makes fetch send `application/x-www-form-urlencoded`,
 * which is on the CORS safelist, which is what keeps the request out of a
 * preflight Substack answers with no Access-Control-Allow-Origin. Swap it for a
 * JSON string and every signup silently stops leaving the browser — no error, no
 * console warning, nothing on the page. This is the guard against that.
 */
describe("subscribeBody", () => {
  it("is a URLSearchParams, so fetch sends a CORS-safelisted content type", () => {
    expect(subscribeBody("reader@example.com")).toBeInstanceOf(URLSearchParams);
  });

  it("carries the address, form-encoded", () => {
    expect(subscribeBody("reader@example.com").toString()).toBe(
      "email=reader%40example.com",
    );
  });

  it("records the page signed up from when there is one", () => {
    const body = subscribeBody("reader@example.com", "https://memesandmarkets.com/about");
    expect(body.get("first_url")).toBe("https://memesandmarkets.com/about");
  });

  it("omits first_url rather than sending an empty one", () => {
    expect(subscribeBody("reader@example.com").has("first_url")).toBe(false);
  });
});

describe("subscribeEndpoint", () => {
  it("builds the endpoint Substack's own embed posts to", () => {
    expect(subscribeEndpoint("https://memesandmarketspod.substack.com")).toBe(
      "https://memesandmarketspod.substack.com/api/v1/free",
    );
  });

  it("does not double the slash when the publication has a trailing one", () => {
    expect(subscribeEndpoint("https://memesandmarketspod.substack.com/")).toBe(
      "https://memesandmarketspod.substack.com/api/v1/free",
    );
  });
});

/**
 * This is the only validation a signup gets that we can act on. Substack does
 * the real check and answers opaquely, so anything wrong that gets past here is
 * reported to the visitor as success.
 */
describe("validateSubscriber", () => {
  it("accepts an ordinary address and trims it", () => {
    expect(validateSubscriber("  reader@example.com  ")).toEqual({
      ok: true,
      email: "reader@example.com",
    });
  });

  it("asks for an address rather than complaining when the box is empty", () => {
    for (const empty of ["", "   ", null, undefined, 42]) {
      const result = validateSubscriber(empty);
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty("message", "Please add your email address.");
    }
  });

  it("turns away what is plainly not an address", () => {
    for (const bad of [
      "reader",
      "reader@",
      "@example.com",
      "reader@example",
      "a b@c.d",
    ]) {
      expect(validateSubscriber(bad).ok).toBe(false);
    }
  });

  it("turns away an address longer than the RFC maximum", () => {
    expect(validateSubscriber(`${"a".repeat(320)}@example.com`).ok).toBe(false);
  });

  it("is permissive about the shapes real addresses take", () => {
    for (const good of [
      "reader+tag@example.co.uk",
      "first.last@sub.example.com",
      "r@e.io",
    ]) {
      expect(validateSubscriber(good).ok).toBe(true);
    }
  });
});

/**
 * The guard against the bug that actually shipped: the publication address and
 * the site's address were the same string, so every signup posted to our own
 * 404 and was reported as a success.
 */
describe("pointsAtSelf", () => {
  it("catches a signup aimed at the site itself", () => {
    expect(
      pointsAtSelf(
        "https://www.memesandmarkets.com/api/v1/free",
        "https://www.memesandmarkets.com",
      ),
    ).toBe(true);
  });

  it("is quiet when the signup goes to Substack", () => {
    expect(
      pointsAtSelf(
        "https://memesandmarketspod.substack.com/api/v1/free",
        "https://www.memesandmarkets.com",
      ),
    ).toBe(false);
  });

  it("compares origins, not hostnames — a different port is a different site", () => {
    expect(
      pointsAtSelf("http://localhost:3000/api/v1/free", "http://localhost:3000"),
    ).toBe(true);
    expect(
      pointsAtSelf("http://localhost:3001/api/v1/free", "http://localhost:3000"),
    ).toBe(false);
  });

  it("says nothing rather than throwing on an unparseable url", () => {
    expect(pointsAtSelf("", "https://www.memesandmarkets.com")).toBe(false);
  });
});

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
