import { LegalPage, LegalSection } from "@/components/LegalPage";
import { CONTACT_EMAIL } from "@/content/platforms";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Memes & Markets collects, what it does not, and who else receives anything.",
};

/**
 * WHAT THIS PAGE IS AND IS NOT.
 *
 * Every claim below was written from the code rather than from a template: the
 * two forms are app/api/partner and app/api/careers, the CV that the second one
 * stores lands in Google Drive via scripts/sheet-webhook.gs, the storage keys
 * are the two in lib/consent.ts and components/player/LivePlayer.tsx, and the
 * third parties are the hosts the CSP in next.config.ts permits. If any of
 * that changes, this page is wrong until somebody changes it too — which is the
 * usual failure of a privacy policy and the reason for naming the files here.
 *
 * It is NOT legal advice and has not been reviewed by a lawyer. It is an honest
 * description of what the software does, which is the part an engineer can get
 * right; whether it satisfies a given jurisdiction is a question for someone
 * qualified to answer it. The page says so out loud rather than implying an
 * authority it does not have.
 */
export default function Privacy() {
  return (
    <LegalPage eyebrow="Privacy" title="What we collect" updated="2026-09-07">
      <LegalSection id="p-short" heading="The short version">
        <p>
          Two forms on this site collect anything: the partnership enquiry form, and the
          careers application form. The careers one takes a CV if you send one, which is
          the most personal thing this site handles — there is a section on it below.
          Subscribing to the newsletter is a link to Substack, so an address typed there
          is typed on their site and never reaches us. Nothing else asks you for
          information, and nothing on the page tracks you unless you agree to it first.
        </p>
      </LegalSection>

      <LegalSection id="p-newsletter" heading="The newsletter">
        <p>
          There is no signup box on this site — the newsletter link takes you to Substack,
          and everything after that happens on their site under their privacy policy. We
          never see the address, so there is nothing here to store, log or pass on.
        </p>
        <p>
          Following that link tells Substack you came from here, in the way any link
          between two sites does.
        </p>
      </LegalSection>

      <LegalSection id="p-partner" heading="Partnership enquiries">
        <p>
          The form on the{" "}
          <Link href="/partner" className="underline underline-offset-4">
            partnerships page
          </Link>{" "}
          records what you type into it — your name, email address, company if you give
          one, the enquiry type, and your message — along with the time it arrived. It is
          stored in a private Google Sheet that only the show&rsquo;s hosts can open.
        </p>
        <p>
          It is used to reply to you and for nothing else. It is not added to a mailing
          list, not sold, and not shared with anyone outside the show. Ask us to delete it
          and we will.
        </p>
      </LegalSection>

      <LegalSection id="p-careers" heading="Job applications">
        <p>
          The form on the{" "}
          <Link href="/careers" className="underline underline-offset-4">
            careers page
          </Link>{" "}
          records what you type into it — your name, email address, where you are based, a
          link if you give one, and what you wrote — along with which role you applied for
          and the time it arrived. If you attach a CV, we keep the file itself.
        </p>
        <p>
          The written part lands in a private Google Sheet that only the show&rsquo;s
          hosts can open. The CV file is saved into a private Google Drive folder in the
          same account. Neither is public and neither is shared with anyone outside the
          show — the file is not reachable by link, so nobody who has not been given
          access to that folder can open it.
        </p>
        <p>
          <strong style={{ color: "var(--mm-text)" }}>
            We keep an application for twelve months and then delete it, CV and all.
          </strong>{" "}
          If you want it gone sooner, email us and it is gone. That deletion is done by
          hand rather than by a scheduled job, which is worth saying plainly: it is a
          promise kept by people, not by software.
        </p>
        <p>
          It is used to decide whether to talk to you, and for nothing else. It is not
          added to a mailing list, not sold, and not passed to a recruiter.
        </p>
      </LegalSection>

      <LegalSection id="p-cookies" heading="Cookies and local storage">
        <p>
          <strong style={{ color: "var(--mm-text)" }}>Analytics cookies.</strong> If you
          press Accept all on the cookie notice, or turn Analytics on in Cookie settings,
          Google Analytics sets cookies to count visits and see which pages get read. If
          you press Reject all, or ignore the notice, it sets none. Google Analytics still
          loads either way, and while consent is denied it reports without cookies or any
          identifier that could follow you between visits — Google calls these cookieless
          pings. We would rather say that plainly than claim nothing at all is sent.
        </p>
        <p>
          <strong style={{ color: "var(--mm-text)" }}>
            Two things that are not cookies.
          </strong>{" "}
          Your choice on that notice is remembered in your browser&rsquo;s local storage,
          so you are not asked again. If you dismiss the live player, that is remembered
          for the current tab session only. Neither leaves your device, and clearing your
          browser data removes both.
        </p>
        <p>
          <strong style={{ color: "var(--mm-text)" }}>Changing your mind.</strong> The
          notice does not come back once you have answered it, so there is a{" "}
          <strong style={{ color: "var(--mm-text)" }}>Cookies</strong> link in the footer
          of every page. It reopens the same categories, set to whatever you chose last
          time, and takes effect immediately. Clearing this site&rsquo;s storage in your
          browser settings also works, and puts the notice back on your next visit.
        </p>
      </LegalSection>

      <LegalSection id="p-others" heading="Who else is involved">
        <p>
          <strong style={{ color: "var(--mm-text)" }}>Twitch.</strong> When the show is
          broadcasting, the live player embeds Twitch&rsquo;s own video player. That is
          Twitch&rsquo;s software running in a frame, and it can set its own cookies. It
          only appears while the show is actually on air.
        </p>
        <p>
          <strong style={{ color: "var(--mm-text)" }}>Vercel.</strong> The site is hosted
          by Vercel, whose servers keep ordinary request logs — including IP addresses —
          as any web server does.
        </p>
        <p>
          <strong style={{ color: "var(--mm-text)" }}>Google and YouTube.</strong> Episode
          listings and the subscriber and view counts are fetched by our server, not by
          your browser, so loading this site does not report your visit to YouTube.
          Following a link to a platform, obviously, takes you to them and their terms.
        </p>
        <p>
          Google has a second role here, and a bigger one. Anything you send through the
          partnership or careers forms — including a CV — is stored in Google Sheets and
          Google Drive under the show&rsquo;s own Google account, which means it sits on
          Google&rsquo;s servers under their terms, with them acting as a processor for
          us. The job listings on the careers page are read back out of that same sheet.
        </p>
        <p>
          Your IP address is used briefly, in memory, to rate-limit the two forms so they
          cannot be abused. It is not stored for that purpose and is not associated with
          anything you submit.
        </p>
      </LegalSection>

      <LegalSection id="p-rights" heading="Your data, and getting rid of it">
        <p>
          Ask and we will tell you what we hold, correct it, or delete it. In practice the
          only things we hold are a partnership enquiry and a job application, if you sent
          either — and for an application that includes the CV file, which we will delete
          on request rather than waiting out the twelve months. For the newsletter,
          unsubscribing from any issue is the fastest route.
        </p>
        <p>
          Depending on where you live you may have stronger statutory rights than that —
          to access, correct, erase, or object to processing. We will honour them; write
          to us.
        </p>
      </LegalSection>

      <LegalSection id="p-contact" heading="Asking us anything">
        <p>
          Email{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline underline-offset-4"
            style={{ color: "var(--mm-text)" }}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <p style={{ color: "var(--mm-text-3)" }}>
          This page describes how the site works, accurately and in plain language. It is
          not legal advice and has not been reviewed by a lawyer. If you need it to
          satisfy a particular regulation, have someone qualified check it.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
