"use client";

import { useId, useState } from "react";
import { DGL } from "@/data/dgl";
import { missingSeedPrompts, setupSections } from "@/lib/dgl/setup-view";
import { outcomeText, type UseAdmin } from "@/lib/dgl/use-admin";
import type { AdminState } from "@/lib/dgl/types";
import { cn } from "@/lib/utils";
import { BTN, GHOST, OFF, PRIMARY } from "./admin-styles";
import { INPUT } from "./AdminLogin";
import { AdminsSection, AuditSection, ModerationSection, ResetSection } from "./SetupAdmins";
import { ERROR, HINT, LABEL, NoteLine, Section, useSetupAct } from "./setup-parts";

const c = DGL.copy.admin;
const s = c.setup;

export type View = "live" | "setup";

/**
 * The two-item switch at the top of the console. Buttons with aria-pressed
 * (a segmented control), not tabs: both views stay mounted and the hidden
 * one keeps its state, so this is a toggle between two regions.
 */
export function ViewSwitch({ view, onChange }: { view: View; onChange(v: View): void }) {
  return (
    <div role="group" aria-label={c.views.label} className="glass-pill mt-4 inline-flex self-start rounded-pill p-1">
      {(["live", "setup"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={cn(BTN, "h-11 min-w-24 px-5 text-[15px]", view === v ? "bg-text text-[#0a0a0c]" : "cursor-pointer text-text hover:bg-white/10")}
        >
          {c.views[v]}
        </button>
      ))}
    </div>
  );
}

/**
 * Setup, for super admins: the prompt pool, admins (all-track accounts only),
 * moderation, the audit log and reset. Each section shows
 * only when the role may do what it offers (setupSections).
 * Every change goes through useAdmin().act, so the state it answers with is
 * adopted at once and the live view sees it too.
 */
export function SetupPanel({ admin, state }: { admin: UseAdmin; state: AdminState }) {
  const show = new Set(setupSections(state));
  return (
    <div className="mt-6 flex max-w-[880px] flex-col gap-8">
      {show.has("prompts") && <PromptsSection admin={admin} state={state} />}
      {show.has("admins") && state.admins && <AdminsSection admin={admin} state={state} admins={state.admins} />}
      {show.has("moderation") && state.moderation && <ModerationSection admin={admin} rows={state.moderation} />}
      {show.has("audit") && state.audit && <AuditSection entries={state.audit} />}
      {show.has("reset") && <ResetSection admin={admin} state={state} />}
    </div>
  );
}

type Prompt = AdminState["prompts"][number];

function PromptsSection({ admin, state }: { admin: UseAdmin; state: AdminState }) {
  const ids = { title: useId(), text: useId(), err: useId(), seed: useId() };
  const { note, setNote, run, mounted } = useSetupAct(admin);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const list = state.prompts;
  const missing = missingSeedPrompts(
    list.map((p) => p.text),
    DGL.promptSeed,
  );
  const seeding = progress !== null;
  const off = admin.busy || seeding;

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (off) return;
    const t = text.trim();
    if (!t) return setError(s.prompts.textMissing);
    setError(null);
    const r = await run({ type: "upsertPrompt", text: t, active: true }, s.prompts.added);
    if (r?.ok && mounted.current) setText("");
  };

  /** Sends the missing starter prompts one at a time, with progress; stops on the first one that fails. */
  const seed = async () => {
    if (off || missing.length === 0) return;
    const todo = [...missing];
    setNote(null);
    try {
      for (const [i, t] of todo.entries()) {
        if (!mounted.current) return;
        setProgress(s.prompts.seedProgress(i + 1, todo.length));
        const r = await run({ type: "upsertPrompt", text: t, active: true }, null);
        if (!r?.ok) {
          const why = r ? outcomeText(r) : c.outcome.network;
          if (mounted.current) setNote({ tone: "error", text: `${s.prompts.seedStopped(i, todo.length)} ${why ?? ""}`.trim() });
          return;
        }
      }
      if (mounted.current) setNote({ tone: "ok", text: s.prompts.seedFinished(todo.length) });
    } finally {
      if (mounted.current) setProgress(null);
    }
  };

  const remove = (p: Prompt) => {
    if (off) return;
    void run({ type: "removePrompt", id: p.id }, s.prompts.removed);
  };

  const seedOff = off || missing.length === 0;
  return (
    <Section id={ids.title} title={s.prompts.title} body={s.prompts.body}>
      {list.length === 0 ? (
        <p className="text-[15px] text-muted">{s.prompts.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
              <span className="min-w-0 flex-1 basis-56">
                <span className="break-words text-[15px] text-text">{p.text}</span>
              </span>
              <button type="button" onClick={() => remove(p)} aria-disabled={off || undefined} className={cn(BTN, "h-11 px-4 text-[15px]", off ? OFF : GHOST)}>
                {s.prompts.remove}
                <span className="sr-only"> {p.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form method="post" noValidate onSubmit={add} className="flex flex-col gap-2 pt-2">
        <label htmlFor={ids.text} className={LABEL}>
          {s.prompts.text}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={ids.text}
            type="text"
            autoComplete="off"
            maxLength={s.prompts.maxLength}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.err : undefined}
            className={cn(INPUT, "min-w-0 flex-1")}
          />
          <button type="submit" aria-disabled={off || undefined} className={cn(BTN, "h-12 shrink-0 px-5 text-[15px]", off ? OFF : PRIMARY)}>
            {s.prompts.add}
          </button>
        </div>
        {error && (
          <p id={ids.err} className={ERROR}>
            {error}
          </p>
        )}
      </form>

      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => void seed()}
          aria-disabled={seedOff || undefined}
          aria-describedby={ids.seed}
          className={cn(BTN, "h-12 self-start px-5 text-[15px]", seedOff ? OFF : GHOST)}
        >
          {s.prompts.seed}
        </button>
        <p id={ids.seed} className={HINT}>
          {progress ?? (missing.length === 0 ? s.prompts.seedDone : s.prompts.seedBody(missing.length))}
        </p>
      </div>
      <NoteLine note={note} />
    </Section>
  );
}
