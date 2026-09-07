import { SiteHeader } from "@/components/SiteHeader";
import { CareersForm } from "@/components/ui/CareersForm";
import { CONTACT_EMAIL } from "@/content/platforms";
import { type Role, findRole, getRoles, openRoles } from "@/lib/roles";
import { JsonLd, jobPostingSchema } from "@/lib/schema";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * One job listing.
 *
 * OPEN roles are pre-rendered below. `dynamicParams` is left at its default of
 * true on purpose, and that default is the entire point of keeping listings in a
 * sheet: a role added after the last build renders on its first request and is
 * then cached for ROLES_REVALIDATE. If a new listing needed a deploy, we would
 * have built a content module with extra steps.
 *
 * CLOSED roles are a page, not a 404, and they are deliberately absent from
 * generateStaticParams so they render on demand. The URL of a role that has just
 * closed is the one that has been pasted into LinkedIn posts, group chats and
 * people's inboxes, and it goes on being clicked for months. A 404 loses that
 * person at the exact moment they were most interested, when there is an obvious
 * better thing to say: this one has gone, here is what else is open, and here is
 * how to tell us what you do anyway.
 *
 * DRAFT roles never reach this file — the Apps Script drops them and
 * lib/roles-sheet.ts drops them again — so they 404 like any unknown slug. That
 * is right: a distinguishable response would leak that an unpublished role is
 * being prepared.
 */
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

export async function generateStaticParams() {
  return openRoles(await getRoles()).map((role) => ({ slug: role.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const role = findRole(await getRoles(), slug);
  if (!role) return { title: "Role not found" };

  return {
    title: role.status === "Closed" ? `${role.title} (closed)` : role.title,
    description:
      role.summary || `${role.title} at Memes & Markets. ${role.location}.`.trim(),
    // Follow, so the links out of a closed page still carry weight to the pages
    // that are open. Index, no: Google's job posting policy wants the listing
    // gone once it stops accepting applications.
    ...(role.status === "Closed" && { robots: { index: false, follow: true } }),
  };
}

export default async function RolePage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const roles = await getRoles();
  const role = findRole(roles, slug);
  if (!role) notFound();

  const closed = role.status === "Closed";
  const alsoOpen = openRoles(roles).filter((r) => r.slug !== role.slug);

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-[900px] px-6 pt-16 pb-24">
        {/* Only while the role is open. Structured data on a listing that has
            stopped accepting applications is a Google policy violation, not
            merely stale. */}
        {!closed && <JsonLd data={jobPostingSchema(role)} />}

        <p className="type-mono-label" style={{ color: "var(--mm-accent)" }}>
          {role.team || "Careers"}
        </p>
        <h1 className="type-display-md mm-wordmark mt-4 text-balance">{role.title}</h1>

        {closed ? (
          <div
            className="mt-8 rounded-[16px] border p-8"
            style={{ background: "var(--mm-surface)", borderColor: "var(--mm-border)" }}
          >
            <p className="type-heading-md" style={{ color: "var(--mm-accent)" }}>
              This one has closed.
            </p>
            <p
              className="type-body-lg mt-3 max-w-[62ch]"
              style={{ color: "var(--mm-text-2)" }}
            >
              {role.summary ? `${role.summary} ` : ""}
              We are not taking applications for it any more —{" "}
              <Link href="/careers" className="underline underline-offset-4">
                {alsoOpen.length > 0
                  ? "here is what else is open"
                  : "nothing else is open at the moment"}
              </Link>
              . The form at the bottom of this page still works, and a speculative
              application is genuinely how people have ended up here before.
            </p>
          </div>
        ) : (
          <>
            <p
              className="type-body-lg mt-6 max-w-[62ch]"
              style={{ color: "var(--mm-text-2)" }}
            >
              {role.summary}
            </p>
            <MetaGrid role={role} />
          </>
        )}

        {!closed && (
          <>
            <List
              id="role-doing"
              heading="What you would be doing"
              items={role.responsibilities}
            />
            <List
              id="role-looking"
              heading="What we are looking for"
              items={role.requirements}
            />
            {/* Only when there is something in it. A heading over an empty list
                reads as a page that half-failed to load. */}
            <List id="role-nice" heading="Nice to have" items={role.niceToHave} />
            <List id="role-process" heading="How hiring works" items={role.process} />
          </>
        )}

        <section aria-labelledby="role-apply" className="mt-16">
          <h2
            id="role-apply"
            className="type-mono-label border-b pb-3"
            style={{ color: "var(--mm-text)", borderColor: "var(--mm-border)" }}
          >
            {closed ? "Tell us what you do" : `Apply for ${role.title}`}
          </h2>
          <div className="mt-8">
            {/* A closed role's form is a speculative one — no role prop — so the
                application cannot be filed against something nobody is hiring
                for. The validator would refuse it anyway; this way nobody has to
                find that out after writing three paragraphs. */}
            <CareersForm
              role={closed ? undefined : { slug: role.slug, title: role.title }}
              contactEmail={CONTACT_EMAIL}
            />
          </div>
        </section>
      </main>
    </>
  );
}

/**
 * The facts somebody checks before reading a word of the description.
 *
 * Same bordered gap-px grid as the numbers on /partner, so it reads as part of
 * the same site rather than a table dropped into it. Empty values are dropped
 * rather than printed as a blank cell — a listing with no closing date should
 * not have a box on it saying nothing.
 */
function MetaGrid({ role }: { role: Role }) {
  const facts = [
    { label: "Location", value: role.location },
    { label: "Remote", value: role.remote },
    { label: "Type", value: role.employment },
    { label: "Pay", value: role.compensation },
    { label: "Posted", value: role.posted },
    { label: "Closes", value: role.closes || "Open until filled" },
  ].filter((fact) => Boolean(fact.value));

  if (facts.length === 0) return null;

  return (
    <ul
      className="mt-12 grid grid-cols-2 gap-px border sm:grid-cols-3"
      style={{ background: "var(--mm-border)", borderColor: "var(--mm-border)" }}
    >
      {facts.map((fact) => (
        <li
          key={fact.label}
          className="flex flex-col gap-2 px-4 py-5"
          style={{ background: "var(--mm-base)" }}
        >
          <span
            className="type-mono-ticker-sm uppercase"
            style={{ color: "var(--mm-text-3)" }}
          >
            {fact.label}
          </span>
          <span className="type-body-md" style={{ color: "var(--mm-text)" }}>
            {fact.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

function List({ id, heading, items }: { id: string; heading: string; items: string[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby={id} className="mt-16">
      <h2
        id={id}
        className="type-mono-label border-b pb-3"
        style={{ color: "var(--mm-text)", borderColor: "var(--mm-border)" }}
      >
        {heading}
      </h2>
      <ul className="mt-6 flex max-w-[62ch] flex-col gap-3">
        {items.map((item) => (
          <li
            key={item}
            className="type-body-md flex gap-3"
            style={{ color: "var(--mm-text-2)" }}
          >
            <span aria-hidden="true" style={{ color: "var(--mm-accent)" }}>
              —
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
