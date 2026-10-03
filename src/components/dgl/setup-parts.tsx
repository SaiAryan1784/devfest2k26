"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import { outcomeText, type UseAdmin } from "@/lib/dgl/use-admin";
import type { Action, ActionResult } from "@/lib/dgl/types";
import { cn } from "@/lib/utils";

const c = DGL.copy.admin;

/*
 * Building blocks shared by the setup sections (SetupPanel, SetupAdmins):
 * the section shell, the outcome line and the hook that sends one action
 * and words its answer.
 */

export type Note = { tone: "ok" | "error"; text: string } | null;

type RunOptions = {
  /** Shown for the server's `invalid` instead of the general note. */
  invalid?: string;
  /** The version the control was rendered from (versioned actions only: resetShow). */
  version?: number;
};

/**
 * One section's outcome note and a `run` that sends an action through
 * useAdmin().act and words the answer: `ok` text, `invalid` text, or the
 * console's usual note for the code. Callers check `admin.busy` first: act
 * sends nothing while another action is in flight.
 */
export function useSetupAct(admin: UseAdmin) {
  const [note, setNote] = useState<Note>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A second submit before the re-render that marks the console busy: act
  // would send nothing and answer null, which must not read as "no answer".
  const sending = useRef(false);

  const run = async (action: Action, ok: string | null, o: RunOptions = {}): Promise<ActionResult | null> => {
    if (sending.current) return null;
    sending.current = true;
    let r: ActionResult | null;
    try {
      r = await admin.act(action, o.version);
    } finally {
      sending.current = false;
    }
    if (!mounted.current) return r;
    if (!r) setNote({ tone: "error", text: c.outcome.network });
    else if (r.ok) setNote(ok ? { tone: "ok", text: ok } : null);
    else setNote({ tone: "error", text: r.code === "invalid" && o.invalid ? o.invalid : (outcomeText(r) ?? c.outcome.invalid) });
    return r;
  };

  return { note, setNote, run, mounted };
}

/** The section's outcome line: always present (an empty live region), announced politely. */
export function NoteLine({ note }: { note: Note }) {
  return (
    <p role="status" aria-live="polite" className={cn("min-h-[1.5em] text-[15px] font-medium leading-snug", note?.tone === "error" ? "text-red-hi" : "text-green-hi")}>
      {note && (
        <span className="flex items-start gap-2">
          {note.tone === "error" ? (
            <WarningCircle aria-hidden="true" weight="regular" className="mt-[2px] size-5 shrink-0" />
          ) : (
            <CheckCircle aria-hidden="true" weight="regular" className="mt-[2px] size-5 shrink-0" />
          )}
          {note.text}
        </span>
      )}
    </p>
  );
}

/** A setup section: heading, a line of context, then its content. Sections are split by one soft divider. */
export function Section({ id, title, body, children }: { id: string; title: string; body?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-4 border-t border-hair pt-8 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-[19px] font-semibold text-text">
          {title}
        </h2>
        {body && <p className="max-w-[68ch] text-[15px] leading-snug text-muted">{body}</p>}
      </div>
      {children}
    </section>
  );
}

/** Label text above an input. */
export const LABEL = "text-[15px] font-medium text-text";
/** A hint or reason under a control. */
export const HINT = "text-[13px] leading-snug text-muted";
/** A field's error under its input. */
export const ERROR = "text-[15px] leading-snug text-red-hi";

