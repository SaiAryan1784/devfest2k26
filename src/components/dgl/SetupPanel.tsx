"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import { missingSeedPrompts, nextSort, parseSort, setupSections, swapSort } from "@/lib/dgl/setup-view";
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
 * Setup: contestants and prompts (operators and super admins), then admins,
 * moderation, the audit log and reset (super admins). Each section shows
 * only when the role may do what it offers (setupSections).
 * Every change goes through useAdmin().act, so the state it answers with is
 * adopted at once and the live view sees it too.
 */
export function SetupPanel({ admin, state }: { admin: UseAdmin; state: AdminState }) {
  const show = new Set(setupSections(state));
  return (
    <div className="mt-6 flex max-w-[880px] flex-col gap-8">
      {show.has("contestants") && <ContestantsSection admin={admin} state={state} />}
      {show.has("prompts") && <PromptsSection admin={admin} state={state} />}
      {show.has("admins") && state.admins && <AdminsSection admin={admin} state={state} admins={state.admins} />}
      {show.has("moderation") && state.moderation && <ModerationSection admin={admin} rows={state.moderation} />}
      {show.has("audit") && state.audit && <AuditSection entries={state.audit} />}
      {show.has("reset") && <ResetSection admin={admin} state={state} />}
    </div>
  );
}

type Contestant = AdminState["contestants"][number];

function ContestantsSection({ admin, state }: { admin: UseAdmin; state: AdminState }) {
  const ids = { title: useId(), name: useId(), sort: useId(), nameErr: useId(), sortErr: useId(), sortHint: useId() };
  const { note, run, mounted } = useSetupAct(admin);
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  // Null until typed in: the field then shows one past the highest sort.
  const [sortText, setSortText] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; sort?: string }>({});
  const list = state.contestants;
  const off = admin.busy || working;
  const sortShown = sortText ?? String(nextSort(list));

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (off) return;
    const n = name.trim();
    const sort = parseSort(sortShown);
    const next = { name: n ? undefined : s.contestants.nameMissing, sort: sort === null ? s.contestants.sortInvalid : undefined };
    setErrors(next);
    if (next.name || next.sort || sort === null) return;
    const r = await run({ type: "upsertContestant", name: n, sort, active: true }, s.contestants.added(n));
    if (r?.ok && mounted.current) {
      setName("");
      setSortText(null);
    }
  };

  /** Up or down one place: two sort swaps (or a renumber when sorts tie), sent one by one; stops on the first refusal. */
  const move = async (index: number, dir: -1 | 1) => {
    if (off) return;
    const updates = swapSort(list, index, dir);
    if (updates.length === 0) return;
    setWorking(true);
    try {
      for (const [i, u] of updates.entries()) {
        const k = list.find((x) => x.id === u.id);
        if (!k) return;
        const last = i === updates.length - 1;
        const r = await run({ type: "upsertContestant", id: k.id, name: k.name, sort: u.sort, active: k.active }, last ? s.contestants.moved : null);
        if (!r?.ok) return;
      }
    } finally {
      if (mounted.current) setWorking(false);
    }
  };

  const toggle = (k: Contestant) => {
    if (off) return;
    void run({ type: "upsertContestant", id: k.id, name: k.name, sort: k.sort, active: !k.active }, s.saved);
  };

  return (
    <Section id={ids.title} title={s.contestants.title} body={s.contestants.body}>
      {list.length === 0 ? (
        <p className="text-[15px] text-muted">{s.contestants.empty}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {list.map((k, i) =>
            editing === k.id ? (
              <li key={k.id}>
                <ContestantEdit
                  contestant={k}
                  off={off}
                  onCancel={() => setEditing(null)}
                  onSave={async (n, sort) => {
                    const r = await run({ type: "upsertContestant", id: k.id, name: n, sort, active: k.active }, s.saved);
                    if (r?.ok && mounted.current) setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                <span className="w-12 shrink-0 font-mono text-[15px] tabular-nums text-muted">
                  <span className="sr-only">{s.contestants.sort} </span>
                  {k.sort}
                </span>
                <span className="min-w-0 flex-1 basis-40">
                  <span className={cn("break-words text-[15px]", k.active ? "text-text" : "text-muted")}>{k.name}</span>
                  {!k.active && <span className="ml-2 text-[13px] text-muted">{s.inactive}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <IconButton label={s.contestants.moveUp(k.name)} off={off || i === 0} onClick={() => void move(i, -1)}>
                    <ArrowUp aria-hidden="true" weight="regular" className="size-5" />
                  </IconButton>
                  <IconButton label={s.contestants.moveDown(k.name)} off={off || i === list.length - 1} onClick={() => void move(i, 1)}>
                    <ArrowDown aria-hidden="true" weight="regular" className="size-5" />
                  </IconButton>
                  <button type="button" onClick={() => !off && setEditing(k.id)} aria-disabled={off || undefined} className={cn(BTN, "h-11 px-4 text-[15px]", off ? OFF : GHOST)}>
                    {s.edit}
                    <span className="sr-only"> {k.name}</span>
                  </button>
                  <button type="button" onClick={() => toggle(k)} aria-disabled={off || undefined} className={cn(BTN, "h-11 px-4 text-[15px]", off ? OFF : GHOST)}>
                    {k.active ? s.deactivate : s.activate}
                    <span className="sr-only"> {k.name}</span>
                  </button>
                </span>
              </li>
            ),
          )}
        </ol>
      )}

      <form method="post" noValidate onSubmit={add} className="flex flex-col gap-3 pt-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <label htmlFor={ids.name} className={LABEL}>
              {s.contestants.name}
            </label>
            <input
              id={ids.name}
              type="text"
              autoComplete="off"
              maxLength={s.contestants.maxLength}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? ids.nameErr : undefined}
              className={INPUT}
            />
            {errors.name && (
              <p id={ids.nameErr} className={ERROR}>
                {errors.name}
              </p>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-32">
            <label htmlFor={ids.sort} className={LABEL}>
              {s.contestants.sort}
            </label>
            <input
              id={ids.sort}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={sortShown}
              onChange={(e) => setSortText(e.target.value)}
              aria-invalid={errors.sort ? true : undefined}
              aria-describedby={`${ids.sortHint}${errors.sort ? ` ${ids.sortErr}` : ""}`}
              className={cn(INPUT, "font-mono tabular-nums")}
            />
            <p id={ids.sortHint} className={HINT}>
              {s.contestants.sortHint}
            </p>
            {errors.sort && (
              <p id={ids.sortErr} className={ERROR}>
                {errors.sort}
              </p>
            )}
          </div>
        </div>
        <button type="submit" aria-disabled={off || undefined} className={cn(BTN, "h-12 self-start px-5 text-[15px]", off ? OFF : PRIMARY)}>
          {s.contestants.add}
        </button>
      </form>
      <NoteLine note={note} />
    </Section>
  );
}

type ContestantEditProps = { contestant: Contestant; off: boolean; onCancel(): void; onSave(name: string, sort: number): Promise<void> };

/** Inline edit of one contestant: name and sort, saved together. */
function ContestantEdit({ contestant, off, onCancel, onSave }: ContestantEditProps) {
  const ids = { name: useId(), sort: useId(), err: useId() };
  const [name, setName] = useState(contestant.name);
  const [sortText, setSortText] = useState(String(contestant.sort));
  const [error, setError] = useState<string | null>(null);

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (off) return;
    const n = name.trim();
    const sort = parseSort(sortText);
    if (!n) return setError(s.contestants.nameMissing);
    if (sort === null) return setError(s.contestants.sortInvalid);
    setError(null);
    void onSave(n, sort);
  };

  return (
    <form method="post" noValidate onSubmit={save} className="flex flex-col gap-3 rounded-card bg-white/[0.03] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label htmlFor={ids.name} className={LABEL}>
            {s.contestants.renameLabel(contestant.name)}
          </label>
          <input
            id={ids.name}
            type="text"
            autoComplete="off"
            maxLength={s.contestants.maxLength}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.err : undefined}
            className={INPUT}
          />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-28">
          <label htmlFor={ids.sort} className={LABEL}>
            {s.contestants.sort}
          </label>
          <input
            id={ids.sort}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={sortText}
            onChange={(e) => setSortText(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.err : undefined}
            className={cn(INPUT, "font-mono tabular-nums")}
          />
        </div>
      </div>
      {error && (
        <p id={ids.err} className={ERROR}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={off || undefined} className={cn(BTN, "h-11 px-5 text-[15px]", off ? OFF : PRIMARY)}>
          {s.save}
        </button>
        <button type="button" onClick={onCancel} className={cn(BTN, GHOST, "h-11 px-5 text-[15px]")}>
          {s.cancel}
        </button>
      </div>
    </form>
  );
}

function IconButton({ label, off, onClick, children }: { label: string; off: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={off || undefined}
      onClick={() => !off && onClick()}
      className={cn(BTN, "size-11 shrink-0", off ? OFF : GHOST)}
    >
      {children}
    </button>
  );
}

type Prompt = AdminState["prompts"][number];

function PromptsSection({ admin, state }: { admin: UseAdmin; state: AdminState }) {
  const ids = { title: useId(), text: useId(), err: useId(), seed: useId() };
  const { note, setNote, run, mounted } = useSetupAct(admin);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
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

  const toggle = (p: Prompt) => {
    if (off) return;
    void run({ type: "upsertPrompt", id: p.id, text: p.text, active: !p.active }, s.saved);
  };

  const seedOff = off || missing.length === 0;
  return (
    <Section id={ids.title} title={s.prompts.title} body={s.prompts.body}>
      {list.length === 0 ? (
        <p className="text-[15px] text-muted">{s.prompts.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {list.map((p) =>
            editing === p.id ? (
              <li key={p.id}>
                <PromptEdit
                  prompt={p}
                  off={off}
                  onCancel={() => setEditing(null)}
                  onSave={async (t) => {
                    const r = await run({ type: "upsertPrompt", id: p.id, text: t, active: p.active }, s.saved);
                    if (r?.ok && mounted.current) setEditing(null);
                  }}
                />
              </li>
            ) : (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
                <span className="min-w-0 flex-1 basis-56">
                  <span className={cn("break-words text-[15px]", p.active ? "text-text" : "text-muted")}>{p.text}</span>
                  {!p.active && <span className="ml-2 text-[13px] text-muted">{s.inactive}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => !off && setEditing(p.id)} aria-disabled={off || undefined} className={cn(BTN, "h-11 px-4 text-[15px]", off ? OFF : GHOST)}>
                    {s.edit}
                    <span className="sr-only"> {p.text}</span>
                  </button>
                  <button type="button" onClick={() => toggle(p)} aria-disabled={off || undefined} className={cn(BTN, "h-11 px-4 text-[15px]", off ? OFF : GHOST)}>
                    {p.active ? s.deactivate : s.activate}
                    <span className="sr-only"> {p.text}</span>
                  </button>
                </span>
              </li>
            ),
          )}
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

/** Inline edit of one prompt's text. */
function PromptEdit({ prompt, off, onCancel, onSave }: { prompt: Prompt; off: boolean; onCancel(): void; onSave(text: string): Promise<void> }) {
  const ids = { text: useId(), err: useId() };
  const [text, setText] = useState(prompt.text);
  const [error, setError] = useState<string | null>(null);

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (off) return;
    const t = text.trim();
    if (!t) return setError(s.prompts.textMissing);
    setError(null);
    void onSave(t);
  };

  return (
    <form method="post" noValidate onSubmit={save} className="flex flex-col gap-3 rounded-card bg-white/[0.03] p-4">
      <label htmlFor={ids.text} className={LABEL}>
        {s.prompts.editLabel}
      </label>
      <input
        id={ids.text}
        type="text"
        autoComplete="off"
        maxLength={s.prompts.maxLength}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? ids.err : undefined}
        className={INPUT}
      />
      {error && (
        <p id={ids.err} className={ERROR}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={off || undefined} className={cn(BTN, "h-11 px-5 text-[15px]", off ? OFF : PRIMARY)}>
          {s.save}
        </button>
        <button type="button" onClick={onCancel} className={cn(BTN, GHOST, "h-11 px-5 text-[15px]")}>
          {s.cancel}
        </button>
      </div>
    </form>
  );
}
