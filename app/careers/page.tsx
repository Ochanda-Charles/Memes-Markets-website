import { SiteHeader } from "@/components/SiteHeader";
import { CareersForm } from "@/components/ui/CareersForm";
import { CONTACT_EMAIL, HOSTS, POSITIONING, SCHEDULE } from "@/content/platforms";
import { type Role, getRoles, openRoles } from "@/lib/roles";
import type { Metadata } from "next";
import Link from "next/link";

/**
 * Next derives a route's revalidate from the fetches inside it — and when no
 * SHEET_WEBHOOK is configured, getRoles() never makes one. The page then builds
 * fully static with no window at all, so configuring the sheet after a deploy
 * would leave this frozen on "nothing open" until somebody redeployed.
 *
 * Declaring it here gives the route a window either way. It is a literal because
 * Next only accepts a statically analysable one; keep it equal to
 * ROLES_REVALIDATE in lib/roles.ts, which lib/roles.test.ts checks.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Careers",
  description: `Jobs at Memes & Markets. ${POSITIONING}, hosted by ${HOSTS}.`,
};

/**
 * Where the show hires from.
 *
 * THE PAGE HAS TO WORK WITH NOTHING ON IT. Most of the time there will be no
 * open role — the show is two people and hires in bursts — and a careers page
 * that is a dead end for eleven months of the year is worse than not having one.
 * So the general application below is present in both states: under the roles
 * when some are open, and as the whole page when none are. One component, one
 * code path, one thing to test.
 *
 * Listings come from a Google Sheet rather than this repo, so that publishing
 * one does not require a developer. See lib/roles.ts for why, and for what
 * happens when the sheet is unreachable.
 */
export default async function Careers() {
  const roles = openRoles(await getRoles());
  const open = roles.length > 0;

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[900px] px-6 pt-16 pb-24">
        <p className="type-mono-label" style={{ color: "var(--mm-accent)" }}>
          Careers
        </p>
        <h1 className="type-display-lg mm-wordmark mt-4 text-balance">
          Work on the show
        </h1>
        <p
          className="type-body-lg mt-6 max-w-[62ch]"
          style={{ color: "var(--mm-text-2)" }}
        >
          {POSITIONING}. {SCHEDULE}, live and unedited, hosted by {HOSTS}. It is a small
          operation, which means whatever you do here you will be doing a lot of, and
          nobody will be watching over your shoulder while you do it.
        </p>

        <section aria-labelledby="open-roles-heading" className="mt-16">
          <h2
            id="open-roles-heading"
            className="type-mono-label border-b pb-3"
            style={{ color: "var(--mm-text)", borderColor: "var(--mm-border)" }}
          >
            {open ? "Open roles" : "Nothing open right now"}
          </h2>

          {open ? (
            <ul className="mt-8 flex flex-col gap-4">
              {roles.map((role) => (
                <li key={role.slug}>
                  <RoleCard role={role} />
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="mt-8 rounded-[16px] border p-8"
              style={{
                background: "var(--mm-surface)",
                borderColor: "var(--mm-border)",
              }}
            >
              <p
                className="type-body-lg max-w-[62ch]"
                style={{ color: "var(--mm-text-2)" }}
              >
                There is nothing advertised at the moment. The show hires in bursts, and
                when it does it usually starts with somebody who had already got in touch
                — so if you want to work on this, the form below is not a formality.
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby="general-heading" className="mt-16">
          <h2
            id="general-heading"
            className="type-mono-label border-b pb-3"
            style={{ color: "var(--mm-text)", borderColor: "var(--mm-border)" }}
          >
            {open ? "None of these fit?" : "Tell us what you do"}
          </h2>
          <p
            className="type-body-md mt-6 max-w-[62ch]"
            style={{ color: "var(--mm-text-2)" }}
          >
            Send it anyway. Tell us what you are good at and what you would want to do
            here, and we will keep it on file for when the next thing opens.
          </p>
          <div className="mt-8">
            <CareersForm contactEmail={CONTACT_EMAIL} />
          </div>
        </section>
      </main>
    </>
  );
}

/**
 * One listing on the index.
 *
 * Bordered and hover-lit like the platform buttons and the footer's nav, which
 * is this design's existing vocabulary for "this is a control". The meta row
 * carries the four things somebody decides on before they read a word of the
 * description: where, how, what kind, and how much.
 */
function RoleCard({ role }: { role: Role }) {
  const meta = [role.location, role.remote, role.employment, role.compensation].filter(
    Boolean,
  );

  return (
    <Link
      href={`/careers/${role.slug}`}
      data-analytics="careers_role_open"
      data-analytics-role={role.slug}
      className="group flex flex-col gap-3 rounded-[10px] border p-6 no-underline transition-colors duration-150 hover:border-[var(--mm-accent)] hover:bg-[var(--mm-surface-raised)]"
      style={{ background: "var(--mm-surface)", borderColor: "var(--mm-border)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          {role.team && (
            <p
              className="type-mono-ticker-sm uppercase"
              style={{ color: "var(--mm-accent)" }}
            >
              {role.team}
            </p>
          )}
          <h3 className="type-heading-lg mt-1" style={{ color: "var(--mm-text)" }}>
            {role.title}
          </h3>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="mt-2 size-3 shrink-0 transition-colors duration-150 group-hover:text-[var(--mm-accent)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--mm-text-3)" }}
        >
          <title>Open this role</title>
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </div>

      {role.summary && (
        <p className="type-body-md max-w-[62ch]" style={{ color: "var(--mm-text-2)" }}>
          {role.summary}
        </p>
      )}

      {meta.length > 0 && (
        <p
          className="type-mono-ticker-sm uppercase"
          style={{ color: "var(--mm-text-3)" }}
        >
          {meta.join(" · ")}
        </p>
      )}
    </Link>
  );
}
