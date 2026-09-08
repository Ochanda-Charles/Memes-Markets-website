import { PLATFORMS } from "@/content/platforms";

/**
 * The newsletter signup: a link to Substack, and nothing more.
 *
 * WHY NOT A FORM, given there was one. Substack has no supported API for adding
 * a subscriber, and the undocumented endpoint behind their embed now sits behind
 * Cloudflare bot management, which blocks every server-side POST. That was
 * measured, not assumed: the identical request returns 403 with an HTML error
 * page from a server and a normal JSON response from a browser, on any
 * publication, whatever headers are sent.
 *
 * Two ways round it were built and rejected. Substack's own framed embed works,
 * but the frame is cross-origin so none of the site's styling reaches inside it —
 * it renders in their default serif on a light card in the middle of a near-black
 * page. Collecting addresses in a sheet and importing them in batches also works,
 * and puts a standing manual chore on somebody twice a week, which is the kind of
 * thing that quietly stops happening.
 *
 * So: a button that goes where the signup actually lives. It cannot half-work, it
 * cannot silently drop an address, and it needs no key, endpoint or secret. When
 * the newsletter is worth automating properly — a provider with a real API — this
 * is one component to replace.
 *
 * The URL comes from PLATFORMS rather than being written again here, so it cannot
 * drift from the Substack link in the footer, the platform bar and the About page.
 */
export function NewsletterCta({
  /** The panel column is narrower than the footer's, so it takes the full width. */
  block = false,
}: { block?: boolean }) {
  const substack = PLATFORMS.find((p) => p.id === "substack");
  if (!substack) return null;

  return (
    <a
      href={substack.href}
      target="_blank"
      rel="noreferrer noopener"
      data-analytics="platform_click"
      data-analytics-platform="substack"
      data-analytics-surface="newsletter"
      className={`mm-consent-action type-label-lg mt-4 items-center gap-3 rounded-[10px] border px-6 py-3 uppercase no-underline ${
        block ? "flex w-full justify-center" : "inline-flex"
      }`}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ background: "var(--mm-accent)" }}
      />
      Subscribe on Substack
    </a>
  );
}
