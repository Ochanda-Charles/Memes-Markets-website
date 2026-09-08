/**
 * Event tracking, provider-agnostic.
 *
 * The provider is now Google Analytics 4, and the indirection this file was
 * built for paid off exactly as intended: wiring it was a change to the one
 * function below, not a hunt through every component that calls it.
 *
 * CONSENT IS NOT CHECKED HERE, and that is deliberate rather than an oversight.
 * Google's Consent Mode owns that decision — components/Analytics.tsx defaults
 * analytics_storage to denied, and the banner flips it. Adding a second gate
 * here would mean two sources of truth for the same question, and the one in
 * this file would be the one that quietly went stale.
 *
 * Every send is still conditional on gtag EXISTING, which it does not without
 * NEXT_PUBLIC_GA_ID. A site with no measurement id sends nothing from here.
 */

export type AnalyticsEvent =
  /** Which of the seven platforms actually wins. The main thing worth knowing. */
  | "platform_click"
  /** The single primary CTA, which opens the info panel. */
  | "cta_more_info"
  /** The live link inside that panel. */
  | "cta_watch_live"
  /** The route from the info panel through to the partnership page. */
  | "cta_partner"
  /** Did anyone touch the sphere, and how — drag, keyboard, or scroll. */
  | "orbit_interact"
  /** An episode opened from the orbit rather than the list below it. */
  | "episode_open"
  /** Which press piece or guest appearance in the info panel got opened. */
  | "press_click"
  /** An address handed to the newsletter box. NOT proof Substack accepted it. */
  | "newsletter_signup"
  /** A listing opened from the careers index. */
  | "careers_role_open"
  /**
   * An application sent. Fired on the route answering ok, not on submit — so it
   * counts applications that landed in the sheet rather than attempts. The
   * partner form has no equivalent; that is a gap in it, not a precedent.
   */
  | "careers_apply";

type Props = Record<string, string | number | boolean | undefined>;

export function track(event: AnalyticsEvent, props?: Props): void {
  if (typeof window === "undefined") return;

  if (process.env.NODE_ENV === "development") {
    // Visible on purpose: the point of this branch is to prove events fire,
    // without a dev session polluting the real property's numbers.
    console.debug("[analytics]", event, props ?? {});
    return;
  }

  window.gtag?.("event", event, props ?? {});
}

/**
 * A page view for a navigation the browser never made.
 *
 * `gtag('config', ...)` in components/Analytics.tsx sends exactly ONE page_view,
 * when the tag first loads. That is the right behaviour for a site where every
 * navigation is a document request, and the wrong behaviour for this one: the
 * footer links to /about, /partner, /privacy and /terms are next/link, so the
 * App Router swaps the page slot without a page load and Google never hears
 * about it. Left alone, GA4 would report a session as one landing page and
 * nothing else, and the four subpages would look like almost nobody visits them
 * — indistinguishable, in the reports, from a site nobody explores.
 *
 * Deliberately NOT part of AnalyticsEvent. That union is user intent — things a
 * person chose to do — and page_view is a lifecycle fact. Keeping them apart
 * stops "did anyone click Partner" and "did anyone land on /partner" turning
 * into the same question.
 *
 * The dev-mode branch mirrors track() so both behave the same way locally.
 */
export function trackPageView(): void {
  if (typeof window === "undefined") return;

  if (process.env.NODE_ENV === "development") {
    console.debug("[analytics] page_view", window.location.pathname);
    return;
  }

  // GA4's own parameter names. Both have to be sent explicitly: the values
  // captured at `config` time describe the landing page and are stale by now.
  window.gtag?.("event", "page_view", {
    page_location: window.location.href,
    page_title: document.title,
  });
}
