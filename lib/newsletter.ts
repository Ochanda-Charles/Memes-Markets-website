/**
 * The newsletter signup, and one check on how the publication answers.
 *
 * HOW A SIGNUP REACHES SUBSTACK, given the last two attempts failed. Substack
 * has no supported API for adding a subscriber. The undocumented endpoint behind
 * their embed sits behind Cloudflare bot management, and the thing Cloudflare
 * rejects is a non-browser CLIENT, not a datacentre IP — curl is refused from a
 * residential connection just as it is from a serverless function. So no server
 * of ours, on Vercel or anywhere else, will ever be able to make this call, and
 * no proxy fixes it.
 *
 * A browser can, and the route in is narrower than it looks:
 *
 *   fetch(json)          preflighted; the endpoint answers OPTIONS with no
 *                        Access-Control-Allow-Origin at all, so it never sends.
 *   fetch(urlencoded)    a CORS "simple request" — NO preflight. It sends. The
 *                        response is unreadable, which is the whole trade below.
 *
 * That second row is what this file builds. It was missed the first time round
 * because the only browser attempt used JSON, and JSON is the one content type
 * that cannot work; `application/x-www-form-urlencoded` is on the CORS safelist
 * and Substack's Express layer parses it happily. Measured, not assumed: a form
 * POST from an unrelated origin gets Substack's own validator back —
 * {"errors":[{"param":"email","msg":"Please enter a valid email"}]} — where a
 * blocked client gets Cloudflare's HTML 403 instead.
 *
 * WHAT WE GIVE UP. `mode: "no-cors"` means the response is opaque: status 0, no
 * body, no headers. We learn that the round trip completed and nothing more.
 * Two things keep that from becoming a silently dropped address —
 * validateSubscriber below runs first, so the one rejection we could realistically
 * cause never happens, and a fetch that throws puts the Substack link in front of
 * the visitor rather than a shrug. See components/ui/NewsletterForm.tsx.
 *
 * It is still an undocumented endpoint and it can change without notice. The
 * failure mode when it does is a form that reports success while Substack ignores
 * it, which no code here can detect — so the signup wants an occasional
 * end-to-end check by hand, the same way the episode feed has one.
 */

import { looksLikeEmail } from "./email";

/**
 * The publication's own Substack address.
 *
 * IT USED TO BE https://www.memesandmarkets.com, AND THAT BROKE THE DAY THE SITE
 * MOVED ONTO THAT DOMAIN. The Substack and the marketing site both claimed it;
 * the site won. Signups then POSTed to our own domain, where /api/v1/free is a
 * 404, and the posts strip fetched /feed and got the same.
 *
 * The subdomain cannot be taken away by a DNS change, so it is the default.
 *
 * IT DOES NOT WORK YET, AND NOTHING IN THIS FILE CAN MAKE IT. The publication
 * still has www.memesandmarkets.com set as an ENFORCED custom domain — Substack's
 * own API reports custom_domain_optional: false — so the subdomain 301s back here
 * and a POST following that redirect lands on our own 404 as a GET. Releasing the
 * domain in Substack > Settings > Domain is a prerequisite for the signup AND the
 * recent-posts strip.
 */
const DEFAULT_PUBLICATION = "https://memesandmarketspod.substack.com";

/** Server-side reader: the feed, and lib/newsletter-posts.ts. */
export const PUBLICATION = process.env.SUBSTACK_PUBLICATION_URL ?? DEFAULT_PUBLICATION;

/**
 * The same address, for the browser bundle.
 *
 * A second variable rather than a rename, because SUBSTACK_PUBLICATION_URL is
 * already set in Vercel and quietly falling back to the default is exactly the
 * kind of breakage this file exists to complain about. NEXT_PUBLIC_ is required:
 * the signup POST happens in the visitor's browser, so the value has to be
 * inlined at build time, and `process.env.NEXT_PUBLIC_…` must be written out in
 * full for Next to find and replace it.
 */
export const BROWSER_PUBLICATION =
  process.env.NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL ?? DEFAULT_PUBLICATION;

/** RFC's maximum. Anything longer is a payload, not an address. */
const MAX_EMAIL = 320;

/** The endpoint Substack's own embed posts to. Trailing slashes are tolerated. */
export function subscribeEndpoint(publication: string = BROWSER_PUBLICATION): string {
  return `${publication.replace(/\/+$/, "")}/api/v1/free`;
}

export type SubscribeCheck = { ok: true; email: string } | { ok: false; message: string };

/**
 * Check an address before it is sent, and normalise it.
 *
 * This matters more here than on the partnership form, and for a reason specific
 * to the opaque response: Substack WILL reject a malformed address, and we will
 * not hear about it. Catching it here is the difference between "that does not
 * look like an email" and a cheerful confirmation for a signup that never
 * happened. Pure, so lib/newsletter.test.ts covers every branch without a network.
 */
export function validateSubscriber(raw: unknown): SubscribeCheck {
  const email = typeof raw === "string" ? raw.trim() : "";
  if (!email) return { ok: false, message: "Please add your email address." };
  if (email.length > MAX_EMAIL || !looksLikeEmail(email)) {
    return { ok: false, message: "That does not look like an email address." };
  }
  return { ok: true, email };
}

/**
 * The POST body.
 *
 * URLSearchParams rather than a JSON string, and that is the load-bearing choice
 * in this file — passing one to fetch sets the content type to
 * `application/x-www-form-urlencoded`, which is on the CORS safelist, which is
 * what keeps the request out of preflight. Hand it a JSON string and the signup
 * stops working with no visible cause.
 *
 * `first_url` is what Substack's embed sends and is the only extra worth having:
 * it records which page a reader signed up from. Everything else their form
 * carries is referral plumbing we do not use.
 */
export function subscribeBody(email: string, pageUrl?: string): URLSearchParams {
  const body = new URLSearchParams({ email });
  if (pageUrl) body.set("first_url", pageUrl);
  return body;
}

/**
 * Is the signup pointing back at the site itself?
 *
 * THIS EXACT MISTAKE HAS SHIPPED ONCE. The publication address used to be
 * https://www.memesandmarkets.com, the site moved onto that domain, and every
 * signup was quietly POSTed to our own /api/v1/free — a 404 on our own server,
 * reported to the visitor as success. An opaque response cannot tell the
 * difference, so the check has to happen before the request is made.
 *
 * It does not catch the OTHER shape of the same fault, where the publication
 * address is right but Substack 301s it onto our domain. Nothing on this side of
 * an opaque response can. See the note above about checking it by hand.
 */
export function pointsAtSelf(endpoint: string, pageOrigin: string): boolean {
  try {
    return new URL(endpoint).origin === new URL(pageOrigin).origin;
  } catch {
    return false;
  }
}

/**
 * Did the request end up somewhere that is not the publication?
 *
 * Substack redirects its subdomain to whatever custom domain is configured, and
 * this one's custom domain is now the marketing site — so a feed fetch lands on
 * our own 404. Any substack.com host counts as arrival; being moved around their
 * own estate is their business.
 */
export function redirectedAwayFrom(requested: string, landed: string): boolean {
  let asked: URL;
  let arrived: URL;
  try {
    asked = new URL(requested);
    arrived = new URL(landed);
  } catch {
    return false;
  }
  if (arrived.host === asked.host) return false;
  return !(arrived.host === "substack.com" || arrived.host.endsWith(".substack.com"));
}
