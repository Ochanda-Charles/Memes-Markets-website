"use client";

import { track } from "@/lib/analytics";
import { CV_TYPES, LIMITS } from "@/lib/careers";
import { useEffect, useId, useState } from "react";

type State =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "sending" }
  | { status: "done" }
  | { status: "failed"; message: string; field?: string };

/**
 * The job application form, for a specific role or speculatively.
 *
 * Posts to /api/careers, which forwards to a Google Sheet and saves the CV into
 * a private Drive folder — see lib/careers.ts. Same skeleton as PartnerForm,
 * including its decision not to have a no-JavaScript path: the contact email
 * below is the fallback, and it is the better one, because it also works when
 * the sheet is misconfigured.
 *
 * ONE FORM FOR BOTH CASES. With `role` it is an application for that listing;
 * without, it is "tell us what you do", which is what the page offers when
 * nothing is open. The fields, the bounds, the validator and the endpoint are
 * identical — only the heading and one placeholder change. Two components would
 * be two things to keep in step for no gain.
 *
 * THE CONSENT TICK IS NOT DECORATION. A CV is a dense bundle of personal data —
 * address, phone number, employment history, sometimes a photograph — handed
 * over for one specific purpose. That sending it means "keep this for a year" is
 * not self-evident from the act, and keeping it for a year is precisely what we
 * want to do. The tick is where that is agreed rather than merely announced.
 */
export function CareersForm({
  role,
  contactEmail,
}: {
  /** Undefined for a speculative application. */
  role?: { slug: string; title: string };
  contactEmail: string;
}) {
  const id = useId();
  const [state, setState] = useState<State>({ status: "idle" });
  const statusId = `${id}-status`;

  /**
   * Send focus to the field the server blamed.
   *
   * Without this, a failed submit leaves focus on <body>. A sighted person sees
   * the red line beside the button; somebody on a keyboard has to tab back
   * through the whole form to find which box is wrong, and a screen reader user
   * hears the live region once and then has to hunt for it. Running in an
   * effect rather than inline is deliberate: the field has to exist in the DOM
   * with its new aria-invalid before it is focused.
   *
   * `role` is a legitimate miss — the slug is not a field on the form — so an
   * absent element is a no-op rather than an error.
   */
  useEffect(() => {
    if (state.status !== "failed" || !state.field) return;
    document.getElementById(`${id}-${state.field}`)?.focus();
  }, [state, id]);
  // The File itself, not its name: <input type="file"> cannot be re-populated
  // programmatically, so the component has to hold the thing it read.
  const [cv, setCv] = useState<File | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (!file) {
      setCv(null);
      return;
    }
    // These two checks are a courtesy, not a guard. The request is trivially
    // replayable with curl, so /api/careers re-checks both and sniffs the
    // file's leading bytes as well. This exists to save somebody a three-megabyte
    // upload before being told no.
    if (file.size > LIMITS.cvBytes) {
      setCv(null);
      e.currentTarget.value = "";
      setState({
        status: "failed",
        message: "That file is over 2MB. Send a smaller one, or send a link instead.",
        field: "cv",
      });
      return;
    }
    if (!cvType(file)) {
      setCv(null);
      e.currentTarget.value = "";
      setState({
        status: "failed",
        message: "We take PDF or Word documents.",
        field: "cv",
      });
      return;
    }
    setCv(file);
    setState({ status: "idle" });
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    // Checked HERE, before the file is read, and again in lib/careers.ts.
    //
    // The form carries noValidate, so `required` on the box is a hint to the
    // browser and nothing more. Without this, a two-megabyte CV would be encoded
    // and posted to our own server before anybody had agreed we could keep it —
    // and the server would then refuse it, having already been handed the thing
    // it was refusing. The ordering is the point; the duplication is the cost.
    if (data.get("consent") !== "on") {
      setState({
        status: "failed",
        message: "Tick the box so we know we can keep this.",
        field: "consent",
      });
      return;
    }

    let upload: { name: string; type: string; data: string } | undefined;
    if (cv) {
      const type = cvType(cv);
      if (!type) {
        setState({
          status: "failed",
          message: "We take PDF or Word documents.",
          field: "cv",
        });
        return;
      }
      // Its own state, between idle and sending. On a slow phone, encoding two
      // megabytes is a visible pause, and a button still reading "Send
      // application" while nothing happens is how people click it twice.
      setState({ status: "reading" });
      try {
        upload = { name: cv.name, type, data: await readAsBase64(cv) };
      } catch {
        setState({
          status: "failed",
          message: "That file could not be read. Try attaching it again.",
          field: "cv",
        });
        return;
      }
    }

    setState({ status: "sending" });
    try {
      const res = await fetch("/api/careers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // The slug only. The route resolves the title against the live
          // listing, so the Role column is always one of our own strings.
          roleSlug: role?.slug ?? "",
          name: data.get("name"),
          email: data.get("email"),
          location: data.get("location"),
          link: data.get("link"),
          message: data.get("message"),
          consent: data.get("consent") === "on",
          cv: upload,
          company: data.get("company"),
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        field?: string;
      };
      if (body.ok) {
        track("careers_apply", { role: role?.slug ?? "general" });
        setState({ status: "done" });
        form.reset();
        setCv(null);
        return;
      }
      setState({
        status: "failed",
        message: body.message ?? "That did not send. Please try again.",
        field: body.field,
      });
    } catch {
      setState({
        status: "failed",
        message: "Something went wrong sending that. Please try again.",
      });
    }
  };

  if (state.status === "done") {
    return (
      <div
        className="rounded-[16px] border p-8"
        style={{ background: "var(--mm-surface)", borderColor: "var(--mm-border)" }}
      >
        <h3 className="type-heading-lg" style={{ color: "var(--mm-accent)" }}>
          That is with us.
        </h3>
        <p className="type-body-lg mt-3" style={{ color: "var(--mm-text-2)" }}>
          {role
            ? `Your application for ${role.title} has landed.`
            : "Your application has landed."}{" "}
          Thank you &mdash; we know these take real time to put together. Keith and Ben
          read them themselves, and yours stays on file: when something opens up that fits
          what you do, you will be considered for it.
        </p>
      </div>
    );
  }

  const failed = state.status === "failed";
  const busy = state.status === "reading" || state.status === "sending";
  const bad = (field: string) => failed && state.field === field;

  const fieldStyle = (field: string) => ({
    background: "var(--mm-surface)",
    borderColor: bad(field) ? "var(--mm-accent)" : "var(--mm-border)",
    color: "var(--mm-text)",
  });

  /**
   * Point a blamed field at the message that blames it.
   *
   * aria-invalid alone says "this is wrong" and nothing else, so a screen
   * reader user lands on a field marked invalid with no way to reach the reason
   * — the live region announced it once, on submit, and is gone. Describing the
   * field by the status line means the reason is available whenever the field
   * is. `extra` keeps a field's own permanent hint, which the CV input has.
   */
  const describedBy = (field: string, extra?: string) =>
    [bad(field) ? statusId : null, extra].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor={`${id}-name`}>
          <input
            id={`${id}-name`}
            name="name"
            required
            maxLength={LIMITS.name}
            autoComplete="name"
            aria-invalid={bad("name") || undefined}
            aria-describedby={describedBy("name")}
            className="type-body-md w-full rounded-[10px] border px-4 py-3"
            style={fieldStyle("name")}
          />
        </Field>

        <Field label="Email" htmlFor={`${id}-email`}>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            maxLength={LIMITS.email}
            autoComplete="email"
            aria-invalid={bad("email") || undefined}
            aria-describedby={describedBy("email")}
            className="type-body-md w-full rounded-[10px] border px-4 py-3"
            style={fieldStyle("email")}
          />
        </Field>

        {/* Asked because the remote policy on every listing is a real one, and a
            candidate three time zones away is a different conversation. */}
        <Field label="Where you are based" htmlFor={`${id}-location`} optional>
          <input
            id={`${id}-location`}
            name="location"
            maxLength={LIMITS.location}
            autoComplete="address-level2"
            aria-invalid={bad("location") || undefined}
            aria-describedby={describedBy("location")}
            className="type-body-md w-full rounded-[10px] border px-4 py-3"
            style={fieldStyle("location")}
          />
        </Field>

        <Field label="LinkedIn, or a link to your work" htmlFor={`${id}-link`} optional>
          <input
            id={`${id}-link`}
            name="link"
            type="url"
            inputMode="url"
            maxLength={LIMITS.link}
            placeholder="https://"
            aria-invalid={bad("link") || undefined}
            aria-describedby={describedBy("link")}
            className="type-body-md w-full rounded-[10px] border px-4 py-3"
            style={fieldStyle("link")}
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Your CV" htmlFor={`${id}-cv`} optional>
          <input
            id={`${id}-cv`}
            name="cv"
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFile}
            aria-invalid={bad("cv") || undefined}
            aria-describedby={describedBy("cv", `${id}-cv-note`)}
            className="type-body-md w-full cursor-pointer rounded-[10px] border px-4 py-3 file:mr-4 file:cursor-pointer file:rounded-[6px] file:border-0 file:bg-[var(--mm-surface-raised)] file:px-3 file:py-1.5 file:text-[var(--mm-text)] file:uppercase"
            style={fieldStyle("cv")}
          />
          <p
            id={`${id}-cv-note`}
            className="type-mono-ticker-sm mt-2"
            style={{ color: "var(--mm-text-3)" }}
          >
            PDF or Word, under 2MB. Send us one of these two — the CV or the link above —
            whichever you have to hand.
          </p>
        </Field>
      </div>

      <div className="mt-5">
        <Field label={role ? "Why this role" : "What you do"} htmlFor={`${id}-message`}>
          <textarea
            id={`${id}-message`}
            name="message"
            required
            rows={6}
            maxLength={LIMITS.message}
            aria-invalid={bad("message") || undefined}
            aria-describedby={describedBy("message")}
            placeholder={
              role
                ? "Why this one, and what you would bring to it."
                : "What you do, what you are good at, and what you would want to do here."
            }
            className="type-body-md w-full rounded-[10px] border px-4 py-3"
            style={fieldStyle("message")}
          />
        </Field>
      </div>

      <label
        htmlFor={`${id}-consent`}
        className="type-body-md mt-6 flex cursor-pointer items-start gap-3"
        style={{ color: "var(--mm-text-2)" }}
      >
        <input
          id={`${id}-consent`}
          name="consent"
          type="checkbox"
          required
          aria-invalid={bad("consent") || undefined}
          aria-describedby={describedBy("consent")}
          className="mt-1 size-4 shrink-0 accent-[var(--mm-accent)]"
        />
        {/* The period is named here, and here only. It used to be stated a
            second time under the button, which is where a person reads it and
            nods; this is where they agree to it. Keep it equal to the twelve
            months app/privacy/page.tsx promises. */}
        <span>
          I am happy for Memes &amp; Markets to keep this application, including my CV,
          for up to 12 months while they consider me.{" "}
          <a href="/privacy" className="underline underline-offset-4">
            What we do with it
          </a>
          .
        </span>
      </label>

      {/* Honeypot. Hidden from sight and from assistive tech, out of the tab
          order, so only something filling every field will touch it. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={busy}
          className="mm-cta shrink-0 rounded-[10px] px-8 py-4 whitespace-nowrap uppercase transition-transform duration-150 hover:scale-[1.02] active:scale-100 disabled:opacity-70"
        >
          {state.status === "reading"
            ? "Reading your CV…"
            : state.status === "sending"
              ? "Sending…"
              : "Send application"}
        </button>

        {/* Empty until something goes wrong, but never removed from the tree.
            It is the form's live region: a screen reader user presses Send and
            is told the outcome because this element is already here to announce
            it. Rendering it only on failure would announce nothing.

            The twelve-month retention line used to sit here. It now lives where
            it is agreed rather than merely stated — on the consent tick above,
            which links to the privacy page carrying the full promise. */}
        <output
          id={statusId}
          className="type-mono-ticker-sm block"
          style={{ color: failed ? "var(--mm-accent)" : "var(--mm-text-3)" }}
        >
          {failed ? state.message : ""}
        </output>
      </div>

      <p className="type-mono-ticker-sm mt-4" style={{ color: "var(--mm-text-3)" }}>
        Or email {contactEmail}
      </p>
    </form>
  );
}

/**
 * The file's type, or null if we do not take it.
 *
 * Falls back to the filename extension when the browser has not offered a type
 * it recognises. Windows without Office installed, and several Android
 * browsers, report application/octet-stream for a .docx — turning those people
 * away would be rejecting real applicants for a browser quirk. The bytes are
 * checked server-side either way, which is what makes it safe to be generous
 * here.
 */
function cvType(file: File): string | null {
  if (file.type in CV_TYPES) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

/**
 * The file as base64, without the data: prefix.
 *
 * readAsDataURL rather than readAsArrayBuffer + btoa: the latter needs a two
 * megabyte loop through String.fromCharCode first, which is slower and a
 * stack-overflow hazard the moment somebody reaches for apply() to speed it up.
 *
 * The mime type travels as its own field rather than being read back out of the
 * data URL, because the copy in there is whatever the operating system guessed —
 * and we want the value cvType() settled on.
 */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const out = String(reader.result);
      resolve(out.slice(out.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="type-mono-label mb-2 block"
        style={{ color: "var(--mm-text-2)" }}
      >
        {label}
        {optional && <span style={{ color: "var(--mm-text-3)" }}> — optional</span>}
      </label>
      {children}
    </div>
  );
}
