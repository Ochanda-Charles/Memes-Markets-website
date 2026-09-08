import { CookieSettingsLink } from "@/components/ui/CookieSettingsLink";
import { NewsletterCta } from "@/components/ui/NewsletterCta";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { DEVELOPER } from "@/content/credits";
import {
  DISCLAIMER,
  HOSTS,
  PLATFORMS,
  SCHEDULE,
  SHOW_CHANNEL,
} from "@/content/platforms";
import Image from "next/image";
import Link from "next/link";

/**
 * Lives in the root layout, so it renders on every page and the disclaimer can
 * never go missing from one of them. That line is a legal requirement, not copy.
 */
export function Footer() {
  return (
    <footer className="mt-auto border-t" style={{ borderColor: "var(--mm-border)" }}>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 pt-16 pb-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          {/* The lockup goes home as well as the header one. It is the other
              place people click by reflex, and on a long page it is the closer
              of the two by the time anyone is looking for it. */}
          <Link
            href="/"
            aria-label="Memes & Markets — back to the homepage"
            className="group flex items-center gap-4 no-underline"
          >
            {/* The master in Assets/ is a 4267px square that is mostly transparent
                padding — at 44px the mark rendered ~19px wide and read as missing.
                public/brand/mm-logo.png is cropped to the ink bounds, hence 522x640. */}
            <Image
              src="/brand/mm-logo.png"
              alt=""
              width={522}
              height={640}
              className="h-11 w-auto shrink-0"
            />
            <div>
              <p
                className="mm-wordmark uppercase underline decoration-transparent underline-offset-[6px] transition-colors duration-150 group-hover:decoration-[var(--mm-accent)]"
                style={{
                  fontWeight: 900,
                  fontSize: "22px",
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                }}
              >
                Memes &amp; Markets
              </p>
              <p className="type-body-sm mt-1" style={{ color: "var(--mm-text-2)" }}>
                {HOSTS} · {SCHEDULE}
              </p>
            </div>
          </Link>

          {/* These were bare uppercase text with an underline that only appeared
              on hover, which is no affordance at all: on a page whose every
              heading is also bare uppercase text, "About" and "Partner" read as
              labels rather than as the only two other pages on the site. Nobody
              hovers something they have not already guessed is a link.
              They are now bordered like the platform buttons above them, which
              is this design's existing vocabulary for "this is a control". */}
          {/* A column, not a wrapping row. Three items in a squeezed middle
              column meant the handle broke to its own line anyway, but as an
              overflow rather than a decision — indented under the buttons and
              running past their right edge. Stacking it says the same thing
              deliberately: two pages, then where to follow the show. */}
          <nav aria-label="Site" className="flex flex-col items-start gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {[
                { href: "/about", label: "About" },
                { href: "/partner", label: "Partner" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="type-label-lg group inline-flex items-center gap-2 rounded-[10px] border px-4 py-2.5 uppercase no-underline transition-colors duration-150 hover:border-[var(--mm-accent)] hover:bg-[var(--mm-surface-raised)]"
                  style={{
                    background: "var(--mm-surface)",
                    borderColor: "var(--mm-border)",
                    color: "var(--mm-text)",
                  }}
                >
                  {item.label}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="size-3 shrink-0 transition-colors duration-150 group-hover:text-[var(--mm-accent)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--mm-text-3)" }}
                  >
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </Link>
              ))}
            </div>

            {/* The one place the show's handle is printed rather than drawn as
                an icon, so it is the show's own — not the clips channel, which
                used to sit here and read like the main account. Left as text: it
                is a handle, and a handle in a button reads as a third page. */}
            <a
              className="type-label-lg uppercase underline decoration-[var(--mm-border-strong)] underline-offset-4 transition-colors duration-150 hover:decoration-[var(--mm-accent)]"
              style={{ color: "var(--mm-text-2)" }}
              href={SHOW_CHANNEL.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {SHOW_CHANNEL.handle}
            </a>
          </nav>

          {/* shrink-0 and no wrap: seven buttons that break to 6 + 1 read as a
              mistake rather than a row. The nav beside it wraps instead, which
              costs nothing because it is text. Below `md` the whole footer row
              is a column and each of these gets the full width anyway. */}
          <ul className="flex shrink-0 flex-wrap items-center gap-2 md:flex-nowrap">
            {PLATFORMS.map((p) => (
              <li key={p.id}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`${p.label} — ${p.handle}`}
                  className="grid size-10 place-items-center rounded-[10px] border transition-colors duration-150 hover:border-[var(--mm-accent)] hover:text-[var(--mm-text)] sm:size-11"
                  style={{
                    background: "var(--mm-surface-raised)",
                    borderColor: "var(--mm-border)",
                    color: "var(--mm-text-2)",
                  }}
                >
                  <PlatformIcon id={p.id} size={18} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <hr style={{ borderColor: "var(--mm-border)" }} />

        {/* The signup lives here as well as in the More info panel, and this is
            the copy that carries the weight: it is on every page, it is reachable
            without opening anything, and it is the only one that works with
            JavaScript off. */}
        <section
          aria-labelledby="footer-newsletter"
          className="grid gap-5 md:grid-cols-2 md:items-start md:gap-10"
        >
          <div>
            <h2
              id="footer-newsletter"
              className="type-mono-label"
              style={{ color: "var(--mm-accent)" }}
            >
              Get the newsletter
            </h2>
            <p className="type-body-md mt-3" style={{ color: "var(--mm-text-2)" }}>
              What actually moved, twice a week, in the time it takes to finish a coffee.
              Straight from our Substack.
            </p>
          </div>
          <NewsletterCta />
        </section>

        <hr style={{ borderColor: "var(--mm-border)" }} />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="type-body-sm" style={{ color: "var(--mm-text-2)" }}>
            {DISCLAIMER}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Text links rather than buttons, unlike About and Partner above.
                These are the pages somebody goes looking for deliberately —
                giving them the same weight as the two pages the site wants read
                would say something untrue about what matters here.
                Careers sits here for that reason and not permanently: with
                nothing open, a bordered CAREERS button beside About and Partner
                would be advertising a job that does not exist. The day there is
                a role worth shouting about, move this object up to the button
                array and change the "two pages" note above it to three. */}
            {[
              { href: "/careers", label: "Careers" },
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="type-mono-ticker-sm uppercase underline decoration-[var(--mm-border-strong)] underline-offset-4 transition-colors duration-150 hover:text-[var(--mm-text-2)] hover:decoration-[var(--mm-accent)]"
                style={{ color: "var(--mm-text-3)" }}
              >
                {item.label}
              </Link>
            ))}

            {/* Gated on the measurement id for the same reason the banner is: with
                no analytics configured there are no cookies to have preferences
                about, and the dialog itself does not mount either. */}
            {process.env.NEXT_PUBLIC_GA_ID && <CookieSettingsLink />}

            {/* The developer credit. Underlined at rest rather than on hover —
                the whole point of it is that somebody who is not looking for it
                notices it is a link, which is the same argument as the nav
                buttons above, at a quieter volume.

                rel="author" is the accurate relationship, and there is no
                nofollow: this is a real credit on a real site, and stripping the
                one thing that makes it worth anything to the person who built it
                would be a strange way to say thank you. */}
            <a
              href={DEVELOPER.href}
              target="_blank"
              rel="author noreferrer noopener"
              className="type-mono-ticker-sm uppercase underline decoration-[var(--mm-border-strong)] underline-offset-4 transition-colors duration-150 hover:text-[var(--mm-text-2)] hover:decoration-[var(--mm-accent)]"
              style={{ color: "var(--mm-text-3)" }}
            >
              Site by {DEVELOPER.name}
            </a>

            <span
              aria-hidden="true"
              className="hidden sm:inline"
              style={{ color: "var(--mm-border-strong)" }}
            >
              ·
            </span>

            <p
              className="type-mono-ticker-sm uppercase whitespace-nowrap"
              style={{ color: "var(--mm-text-3)" }}
            >
              © {new Date().getFullYear()} Memes &amp; Markets
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
