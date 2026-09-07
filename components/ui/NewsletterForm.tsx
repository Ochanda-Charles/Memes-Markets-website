"use client";

import { PLATFORMS } from "@/content/platforms";
import { track } from "@/lib/analytics";
import {
  pointsAtSelf,
  subscribeBody,
  subscribeEndpoint,
  validateSubscriber,
} from "@/lib/newsletter";
import { useId, useState } from "react";

type State =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent" }
  | { status: "failed"; message: string; field: boolean };

/** The publication link, used for both fallbacks. Never written twice. */
const SUBSTACK =
  PLATFORMS.find((p) => p.id === "substack")?.href ?? "https://substack.com";

/**
 * Substack signup box, posted straight from the visitor's browser.
 *
 * WHY THERE IS NO ROUTE OF OURS IN THE MIDDLE ANY MORE. Substack's endpoint
 * refuses non-browser clients outright, so a server hop cannot work; it accepts
 * form-encoded bodies from a browser without a preflight, so it does not need
 * one. lib/newsletter.ts carries the measurements. The upshot for this file is
 * that the request is a plain fetch with no secret in it, which is why the
 * signup needs no env var, no API key and no serverless function.
 *
 * WHAT `mode: "no-cors"` COSTS. The response comes back opaque — status 0, no
 * body — so success and rejection look identical from here. Three things stop
 * that becoming a lie told to a visitor:
 *
 *   1. validateSubscriber runs first, so the one rejection we could plausibly
 *      cause (a malformed address) is caught while we can still say so.
 *   2. A fetch that throws — CSP, offline, DNS, connection refused — is a real
 *      signal, and it puts the Substack link in front of the visitor.
 *   3. The confirmation says what actually happened and offers the direct link
 *      if no email turns up. Nobody is told they are subscribed; they are told
 *      it was sent, which is the part we know.
 *
 * The status line is <output>, which carries an implicit status role and live
 * region — the entire outcome of this interaction is a sentence appearing under
 * a text field, and without it a screen reader user presses Subscribe and is
 * told nothing at all.
 *
 * This needs JavaScript, and unlike the old version there is no no-JS path worth
 * building: a real form POST would work, but only by widening `form-action` in
 * next.config.ts and landing the visitor on raw JSON at substack.com. The
 * <noscript> link goes to the same place the old button did.
 */
export function NewsletterForm({
  /** The panel column is narrower than the footer's, so it stacks. */
  block = false,
}: { block?: boolean }) {
  const id = useId();
  const [state, setState] = useState<State>({ status: "idle" });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // Honeypot: hidden from sight, from assistive tech and from the tab order,
    // so only something filling every field will touch it. A cheerful 200-shaped
    // response rather than an explanation.
    if (String(data.get("company") ?? "").trim()) {
      setState({ status: "sent" });
      form.reset();
      return;
    }

    const checked = validateSubscriber(data.get("email"));
    if (!checked.ok) {
      setState({ status: "failed", message: checked.message, field: true });
      return;
    }

    setState({ status: "sending" });

    const endpoint = subscribeEndpoint();

    // Posting to ourselves is a deployment fault, and an opaque response cannot
    // see it — so it is caught here, before the send. The visitor gets the same
    // sentence a failed send gives them, with the route that does work; the
    // console gets the reason, because nothing on the page can show it.
    if (pointsAtSelf(endpoint, window.location.origin)) {
      console.error(
        `[newsletter] MISCONFIGURED: ${endpoint} is this site, not Substack. Point NEXT_PUBLIC_SUBSTACK_PUBLICATION_URL at the publication.`,
      );
      setState({ status: "failed", message: "That did not send.", field: false });
      return;
    }

    if (process.env.NODE_ENV === "development") {
      // The only way to verify this locally is the Network tab, so say where to
      // look. A 301 here means the custom domain is still enforced on Substack.
      console.info(
        `[newsletter] POST ${endpoint} — opaque by design; the Network tab has the real status.`,
      );
    }

    try {
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        // No explicit content-type: URLSearchParams sets the safelisted one, and
        // setting it by hand risks a charset spelling that trips a preflight.
        body: subscribeBody(checked.email, window.location.href),
      });
      track("newsletter_signup");
      setState({ status: "sent" });
      form.reset();
    } catch {
      setState({
        status: "failed",
        message: "That did not send.",
        field: false,
      });
    }
  };

  if (state.status === "sent") {
    /*
     * "Sent", NOT "subscribed", and the distinction is the honest one: an opaque
     * response tells us the request completed, not that Substack accepted it.
     * The link is the recovery path for the one failure nothing here can see —
     * a visitor who gets no email can finish the job themselves rather than
     * spend a month believing they are on a list they never joined.
     */
    return (
      <p className="type-body-md mt-4" style={{ color: "var(--mm-text)" }}>
        <strong style={{ color: "var(--mm-accent)" }}>That&rsquo;s gone over.</strong>{" "}
        Substack will email you to confirm. If nothing arrives in a few minutes,{" "}
        <a href={SUBSTACK} target="_blank" rel="noreferrer noopener">
          sign up there directly
        </a>
        .
      </p>
    );
  }

  const failed = state.status === "failed";
  const invalidField = failed && state.field;

  return (
    <>
      <form onSubmit={onSubmit} className="mt-4" noValidate>
        <div className={`flex flex-col gap-2 ${block ? "" : "sm:flex-row"}`}>
          <label className="sr-only" htmlFor={`${id}-email`}>
            Email address
          </label>
          <input
            id={`${id}-email`}
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="name@email.com"
            aria-invalid={invalidField || undefined}
            aria-describedby={`${id}-status`}
            className="type-body-md min-w-0 flex-1 rounded-[10px] border px-4 py-3"
            style={{
              background: "var(--mm-surface)",
              borderColor: invalidField ? "var(--mm-accent)" : "var(--mm-border)",
              color: "var(--mm-text)",
            }}
          />

          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          <button
            type="submit"
            disabled={state.status === "sending"}
            className="mm-cta rounded-[10px] px-6 py-3 uppercase transition-transform duration-150 hover:scale-[1.02] active:scale-100 disabled:opacity-70"
          >
            {state.status === "sending" ? "Sending…" : "Subscribe"}
          </button>
        </div>

        <output
          id={`${id}-status`}
          className="type-mono-ticker-sm mt-3 block uppercase"
          style={{ color: failed ? "var(--mm-accent)" : "var(--mm-text-3)" }}
        >
          {failed ? (
            <>
              {state.message}{" "}
              {!state.field && (
                <a href={SUBSTACK} target="_blank" rel="noreferrer noopener">
                  Subscribe on Substack
                </a>
              )}
            </>
          ) : (
            "Free. Unsubscribe any time."
          )}
        </output>
      </form>

      <noscript>
        <a
          href={SUBSTACK}
          target="_blank"
          rel="noreferrer noopener"
          className="type-label-lg mm-consent-action mt-4 inline-flex items-center gap-3 rounded-[10px] border px-6 py-3 uppercase no-underline"
        >
          Subscribe on Substack
        </a>
      </noscript>
    </>
  );
}
