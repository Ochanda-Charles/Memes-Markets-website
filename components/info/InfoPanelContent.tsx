import { LiveCta } from "@/components/ui/LiveCta";
import { NewsletterCta } from "@/components/ui/NewsletterCta";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { HOST_LIST } from "@/content/hosts";
import { PLATFORMS } from "@/content/platforms";
import { PRESS_ITEMS, type PressItem } from "@/content/press";
import Image from "next/image";
import Link from "next/link";

/**
 * Everything inside the More info panel. Split out from the dialog shell so the
 * shell stays about focus, Escape and scroll-lock, and this stays about layout.
 *
 *   cover          16:9, full width of the panel
 *   hosted by      two cards, real photos
 *   press          coverage and guest appearances — see content/press.ts
 *   newsletter     one field
 *   footer row     wordmark and the seven platforms
 *
 * Two columns from `md` up, matching the reference: hosts on the left, press on
 * the right. Below that they stack, because four press rows beside two host cards
 * on a phone is a column of slivers.
 */
export function InfoPanelContent() {
  return (
    <div className="px-5 pb-6 sm:px-8 sm:pb-8">
      <CoverStill />

      <div className="mt-8 grid gap-10 md:grid-cols-2 md:gap-8">
        <section aria-labelledby="info-hosts">
          <PanelHeading id="info-hosts">Hosted by</PanelHeading>
          <ul className="mt-5 grid grid-cols-2 gap-4">
            {HOST_LIST.map((host) => (
              <li key={host.name}>
                {/* 4/3, matching the About page. The source photos are landscape;
                    a portrait crop takes the frame down to foreheads. */}
                <div
                  className="relative overflow-hidden rounded-[14px]"
                  style={{
                    aspectRatio: "4 / 3",
                    background: "var(--mm-surface-raised)",
                  }}
                >
                  <Image
                    src={host.photo}
                    alt={`${host.name}, ${host.role.toLowerCase()} of Memes & Markets`}
                    fill
                    sizes="(min-width: 768px) 220px, 45vw"
                    className="object-cover object-top"
                  />
                </div>
                <p
                  className="type-mono-ticker-sm mt-3 uppercase"
                  style={{ color: "var(--mm-text)" }}
                >
                  {host.name}
                </p>
                <p
                  className="type-mono-ticker-sm mt-1 uppercase"
                  style={{ color: "var(--mm-text-3)" }}
                >
                  {host.role}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="info-press">
          <PanelHeading id="info-press">Press &amp; appearances</PanelHeading>
          {/* gap-px over a border-coloured background: one hairline between cells,
              never a doubled 2px seam where two borders meet.
              One column, not two — every entry carries a line of prose under the
              outlet, and two of those side by side wraps each to four lines. */}
          <ul
            className="mt-5 grid gap-px border"
            style={{ background: "var(--mm-border)", borderColor: "var(--mm-border)" }}
          >
            {PRESS_ITEMS.map((item) => (
              <li key={item.id} style={{ background: "var(--mm-base)" }}>
                <PressEntry item={item} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="info-newsletter" className="mt-10">
        <div className="grid gap-5 md:grid-cols-2 md:items-center md:gap-8">
          <PanelHeading id="info-newsletter">Get the newsletter</PanelHeading>
          <div>
            <p className="type-body-md" style={{ color: "var(--mm-text-2)" }}>
              What actually moved, twice a week, in the time it takes to finish a coffee.
            </p>
            <NewsletterCta block />
          </div>
        </div>
      </section>

      <div
        className="mt-10 flex flex-col items-start gap-6 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: "var(--mm-border)" }}
      >
        <div className="flex flex-wrap items-center gap-5">
          <p
            className="type-heading-lg mm-wordmark uppercase"
            style={{ letterSpacing: "-0.02em" }}
          >
            Memes &amp; Markets
          </p>
          {/* The live route did not disappear with the old hero CTA, it moved here. */}
          <LiveCta />
          {/*
            The panel is where someone works out what the show IS, which makes it
            the moment a sponsor decides whether to ask — and the only route to
            /partner used to be the footer, past the whole page and behind a
            closed dialog. next/link so it is a client navigation; the dialog
            unmounts with the page and MoreInfo's cleanup releases the scroll lock.
          */}
          <Link
            href="/partner"
            data-analytics="cta_partner"
            data-analytics-surface="info_panel"
            className="type-label-lg inline-flex items-center gap-2 uppercase underline decoration-[var(--mm-border-strong)] underline-offset-4 transition-colors duration-150 hover:decoration-[var(--mm-accent)]"
            style={{ color: "var(--mm-text)" }}
          >
            Partner with us
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="size-3 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8h9M8.5 4l4 4-4 4" />
            </svg>
          </Link>
        </div>
        <ul className="flex flex-wrap items-center gap-2">
          {PLATFORMS.map((p) => (
            <li key={p.id}>
              <a
                href={p.href}
                target="_blank"
                rel="noreferrer noopener"
                data-analytics="platform_click"
                data-analytics-platform={p.id}
                data-analytics-surface="info_panel"
                aria-label={`${p.label}, ${p.handle}`}
                className="grid size-9 place-items-center rounded-[8px] border transition-colors duration-150 hover:border-transparent hover:bg-[var(--mm-accent)]"
                style={{
                  background: "var(--mm-surface)",
                  borderColor: "var(--mm-border)",
                  color: "var(--mm-text)",
                }}
              >
                <PlatformIcon id={p.id} />
              </a>
            </li>
          ))}
        </ul>
      </div>

      <p className="type-mono-ticker-sm mt-6" style={{ color: "var(--mm-text-3)" }}>
        For education and entertainment only. Not financial, legal, tax, or investment
        advice.
      </p>
    </div>
  );
}

function PanelHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3
      id={id}
      className="type-mono-label border-b pb-3 uppercase"
      style={{ color: "var(--mm-text)", borderColor: "var(--mm-border)" }}
    >
      {children}
    </h3>
  );
}

/**
 * One press entry. A link when there is something to link to, a plain cell when
 * there is not. Nothing currently uses the second branch — it is there so an
 * appearance whose episode URL nobody has yet can still be listed, rather than
 * being given a guessed link. See content/press.ts.
 */
function PressEntry({ item }: { item: PressItem }) {
  const body = (
    <>
      <span className="type-mono-ticker-sm uppercase" style={{ color: "var(--mm-text)" }}>
        {item.outlet}
      </span>
      <span className="type-body-sm mt-1 block" style={{ color: "var(--mm-text-3)" }}>
        {item.note}
      </span>
    </>
  );

  if (!item.href) {
    return <div className="px-4 py-3">{body}</div>;
  }

  return (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer noopener"
      data-analytics="press_click"
      data-analytics-press={item.id}
      className="flex items-start justify-between gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[var(--mm-surface)]"
    >
      <span>{body}</span>
      {/* Decorative: the link's accessible name is already the outlet and the
          note, and target="_blank" is announced by the UA. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="mt-[3px] size-3 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--mm-text-3)" }}
      >
        <path d="M4 12 12 4M6 4h6v6" />
      </svg>
    </a>
  );
}

/**
 * The cover frame at the top of the panel. Source is 2736x1536 — 16:9 to within
 * a rounding error.
 *
 * It used to be capped at `calc(42vh * 16/9)` and centred, which on a 1120px
 * panel rendered it 672px wide and left 224px of empty panel down each side —
 * 40% of the width doing nothing. That cap was written when this was a striped
 * placeholder, to stop it swallowing a short viewport; the note it carried said
 * height could not be capped because that "stretches the box wider than 16:9".
 *
 * With a real photograph in it, that stretch is the answer rather than the
 * problem. The box now spans the full width and the ratio itself changes: 16:9
 * on narrow screens where there is height to spare, and a 21:9 band from `md`
 * up, where a full-height 16:9 would be 594px tall and push everything else off
 * the first screen. `object-cover` turns the difference into a crop.
 *
 * The crop is biased upward — both hosts sit in the top half of the frame and
 * the bottom is desk and microphone — so 21:9 takes the empty half and leaves
 * two faces filling the width.
 */
function CoverStill() {
  return (
    <div
      className="relative aspect-[16/9] w-full overflow-hidden rounded-[16px] border md:aspect-[21/9]"
      style={{
        borderColor: "var(--mm-border)",
        background: "var(--mm-surface-raised)",
      }}
    >
      <Image
        src="/brand/keith-ben-cover.jpg"
        alt="Keith D and Ben Leavitt on the Memes & Markets set"
        fill
        priority
        // The panel is 1120px at most, less its 64px of padding.
        sizes="(min-width: 1180px) 1056px, calc(100vw - 4rem)"
        className="object-cover"
        style={{ objectPosition: "center 32%" }}
      />
    </div>
  );
}
