"use client";

import { useEffect, useId, useRef, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import { timeoutSignal } from "@/lib/dgl/client-http";
import { cn } from "@/lib/utils";

const c = DGL.copy.admin.signIn;

/** Input style shared by the console: radius 12 (`!` beats the unlayered global :focus-visible radius). */
export const INPUT =
  "h-12 w-full rounded-[12px]! border border-muted/70 bg-surface-2 px-4 text-[17px] text-text placeholder:text-muted";

type Props = {
  /** Called once the server has set the session cookie; the caller re-checks the session. */
  onSignedIn(): void;
  /** A line above the form, e.g. why the console signed out. */
  note?: string | null;
};

/**
 * Admin sign-in: name and passcode, POSTed as JSON to /api/dgl/admin/login,
 * which sets the httpOnly session cookie. The passcode input is uncontrolled
 * so the passcode never sits in React state; it is read once on submit,
 * cleared after a failure, and never logged or put in a URL (the form is
 * method="post" and the submit is a fetch). Shared with the setup panel and
 * the kiosk.
 */
export function AdminLogin({ onSignedIn, note }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pass = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const ids = { name: useId(), pass: useId(), error: useId(), title: useId() };

  useEffect(() => {
    mounted.current = true;
    nameInput.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);

  const fail = (message: string) => {
    if (!mounted.current) return;
    if (pass.current) pass.current.value = "";
    setError(message);
    setBusy(false);
    pass.current?.focus();
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const passcode = pass.current?.value ?? "";
    const trimmed = name.trim();
    if (!trimmed || !passcode) {
      setError(c.missing);
      (trimmed ? pass : nameInput).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dgl/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, passcode }),
        cache: "no-store",
        signal: timeoutSignal(),
      });
      if (res.ok) {
        if (pass.current) pass.current.value = "";
        if (mounted.current) setBusy(false);
        onSignedIn();
        return;
      }
      fail(res.status === 423 ? c.locked : res.status === 401 ? c.invalid : c.failed);
    } catch {
      fail(c.failed);
    }
  }

  return (
    <section aria-labelledby={ids.title} className="glass mx-auto w-full max-w-[420px] rounded-panel p-6 sm:p-8">
      <h1 id={ids.title} className="display text-[26px] font-semibold leading-tight">
        {c.title}
      </h1>
      <p className="mt-2 text-[15px] leading-snug text-muted">{c.body}</p>
      {note && <p className="mt-4 text-[15px] font-medium text-yellow-hi">{note}</p>}
      <form method="post" noValidate onSubmit={submit} className="mt-6 flex flex-col gap-5" aria-describedby={error ? ids.error : undefined}>
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.name} className="text-[15px] font-medium text-text">
            {c.name}
          </label>
          <input
            ref={nameInput}
            id={ids.name}
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.pass} className="text-[15px] font-medium text-text">
            {c.passcode}
          </label>
          <input
            ref={pass}
            id={ids.pass}
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={256}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.error : undefined}
            className={INPUT}
          />
          <p id={ids.error} role="status" aria-live="polite" className={cn("min-h-6 text-[15px] leading-snug text-red-hi", !error && "sr-only")}>
            {error && (
              <span className="flex items-start gap-2">
                <WarningCircle aria-hidden="true" weight="regular" className="mt-[2px] size-5 shrink-0" />
                {error}
              </span>
            )}
          </p>
        </div>
        <button
          type="submit"
          aria-disabled={busy || undefined}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center whitespace-nowrap rounded-pill! px-6 text-[15px] font-medium transition-colors duration-200",
            busy ? "cursor-not-allowed border border-hair bg-white/5 text-muted" : "cursor-pointer bg-text text-[#0a0a0c] hover:bg-white",
          )}
        >
          {busy ? c.submitting : c.submit}
        </button>
      </form>
    </section>
  );
}
