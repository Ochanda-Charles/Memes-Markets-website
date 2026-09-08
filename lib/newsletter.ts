/**
 * The newsletter publication: where it lives, and one check on how it answers.
 *
 * THERE IS NO SIGNUP CODE HERE ANY MORE. Substack has no supported API for
 * adding a subscriber, and the undocumented endpoint behind their embed sits
 * behind Cloudflare bot management, which blocks every server-side POST —
 * measured: the identical request succeeds from a browser and fails from any
 * server, on any publication, whatever headers are sent. A framed embed and a
 * collect-then-import sheet were both built and both rejected, the first for
 * taking the site's design with it and the second for the standing manual chore.
 * The signup is now a link. See components/ui/NewsletterCta.tsx.
 *
 * What is left is what the recent-posts strip needs: the publication's address,
 * and a way to notice when it is answering from the wrong host.
 */

/**
 * The publication's own Substack address.
 *
 * IT USED TO BE https://www.memesandmarkets.com, AND THAT BROKE THE DAY THE SITE
 * MOVED ONTO THAT DOMAIN. The Substack and the marketing site both claimed it;
 * the site won. Signups then POSTed to our own domain, where /api/v1/free is a
 * 404, and the posts strip fetched /feed and got the same.
 *
 * The subdomain cannot be taken away by a DNS change, so it is the default now.
 * It does not work yet either: the publication still has www.memesandmarkets.com
 * set as an ENFORCED custom domain — Substack's own API reports
 * custom_domain_optional: false — so the subdomain 301s here. Releasing it in
 * Substack > Settings > Domain is a prerequisite for anything below working.
 */
export const PUBLICATION =
  process.env.SUBSTACK_PUBLICATION_URL ?? "https://memesandmarketspod.substack.com";

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
