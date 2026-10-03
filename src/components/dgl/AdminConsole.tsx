"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info, SignOut, WarningCircle } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import {
  confirmStep,
  formatRawAverage,
  primaryAction,
  queueAction,
  reassignTargets,
  secondaryActions,
  tapAllowed,
  type DisabledReason,
  type Pending,
  type Primary,
  type Secondary,
  type SecondaryKey,
} from "@/lib/dgl/admin-view";
import { setupSections } from "@/lib/dgl/setup-view";
import { useAdmin, type UseAdmin } from "@/lib/dgl/use-admin";
import type { AdminState, ContestantStatus } from "@/lib/dgl/types";
import { cn } from "@/lib/utils";
import { ActClock } from "./ActClock";
import { ARMED, BTN, CAREFUL, DANGER, GHOST, OFF, PRIMARY } from "./admin-styles";
import { AdminLogin, INPUT } from "./AdminLogin";
import { ConnectionPill } from "./ConnectionPill";
import { ScoreGrid } from "./ScoreGrid";
import { SetupPanel, ViewSwitch, type View } from "./SetupPanel";

const c = DGL.copy.admin;
const CONFIRM_MS = 3000;

/** Secondary controls that are plain buttons (the rest are the prompt, own score and reassign panels). */
type Simple = "pauseVoting" | "resumeVoting" | "stopVoting" | "reopenVoting";
const SIMPLE = new Set<SecondaryKey>(["pauseVoting", "resumeVoting", "stopVoting", "reopenVoting"]);

/**
 * The settle guard, handed to every guarded control (the big button, the
 * queue's Select, and every secondary action that does not need a second
 * tap). For SETTLE_MS after the big button changes those controls render
 * aria-disabled, described by the "Updating" line under the big button, and
 * `canTap()` (checked at tap time, on the exact window) refuses them, so a
 * double tap cannot run the next phase's action. Confirm-gated controls are
 * not guarded: they already need a second, deliberate tap.
 */
type Gate = {
  /** In flight or settling: draw guarded controls as off. */
  blocked: boolean;
  settling: boolean;
  /** The id of the "Updating" line, for aria-describedby while settling. */
  updatingId: string;
  canTap(): boolean;
  /** The version this render shows; every action carries it (see useAdmin.act). */
  version: number;
};

/**
 * /dgl/admin: the sign-in form when signed out, the show console when signed
 * in. The first render (and the server's) is the neutral "Checking session"
 * screen: useAdmin starts in "checking" with no state and reads nothing from
 * the browser while rendering, so hydration matches.
 */
export function AdminConsole() {
  const admin = useAdmin();
  if (admin.session === "signedOut") {
    return (
      <div className="flex min-h-[100dvh] items-center px-4 py-10">
        <AdminLogin onSignedIn={admin.refresh} note={admin.error} />
      </div>
    );
  }
  if (!admin.state) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 px-4">
        <p role="status" className="text-[17px] text-muted">
          {c.checking}
        </p>
        {(admin.connection === "reconnecting" || admin.connection === "offline") && <p className="text-[15px] text-yellow-hi">{c.unreachable}</p>}
      </div>
    );
  }
  return <Console admin={admin} state={admin.state} />;
}

function Console({ admin, state }: { admin: UseAdmin; state: AdminState }) {
  const role = state.me.role;
  const primary = primaryAction(state, role);
  const secondary = secondaryActions(state, role);
  const has = (k: SecondaryKey) => secondary.find((s) => s.key === k) ?? null;
  const queueHeading = useRef<HTMLHeadingElement>(null);
  const updatingId = useId();
  const v = state.version;
  const gate: Gate = {
    blocked: admin.busy || admin.settling,
    settling: admin.settling,
    updatingId,
    canTap: () => !admin.busy && tapAllowed(admin.changedAt, performance.now()),
    version: v,
  };

  // Confirm on a second tap. The key carries the show version, so a change by someone else disarms it.
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setPending(null), Math.max(0, pending.at + CONFIRM_MS - Date.now()));
    return () => clearTimeout(id);
  }, [pending]);
  const keyOf = (k: string) => `${k}@${state.version}`;
  const armed = (k: string) => pending?.key === keyOf(k);
  const tap = (k: string, needsConfirm: boolean, run: () => void, guarded = !needsConfirm) => {
    if (admin.busy) return;
    if (guarded && !gate.canTap()) return;
    if (!needsConfirm) {
      setPending(null);
      run();
      return;
    }
    const step = confirmStep(pending, keyOf(k), Date.now(), CONFIRM_MS);
    setPending(step.pending);
    if (step.confirmed) run();
  };
  const focusQueue = () => queueHeading.current?.focus();

  const runPrimary = async (p: Primary) => {
    if (!p.action) return focusQueue();
    const r = await admin.act(p.action, v);
    if (r?.ok && p.labelKey === "complete") focusQueue();
  };

  const armedLabel = pending ? armedName(pending.key) : null;

  // Live and Setup stay mounted (the hidden one keeps its state, timers and
  // in-flight guard); a role without setup always sees Live.
  const [view, setView] = useState<View>("live");
  const setup = setupSections(state).length > 0;
  const shown: View = setup ? view : "live";

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1200px] flex-col px-4 pt-4 sm:px-6 lg:px-8 lg:pb-12",
        // Below lg the big button is a fixed bar: the padding keeps the last control above it, and the
        // page's scroll padding (set on <html> while this view shows) keeps a focused input from
        // scrolling in under it.
        shown === "live" ? "pb-56 max-lg:[html:has(&)]:[scroll-padding-bottom:14rem]" : "pb-12",
      )}
    >
      <TopBar admin={admin} state={state} />
      {setup && <ViewSwitch view={shown} onChange={setView} />}

      <div hidden={shown !== "live"}>
        {/* Screen reader only: the confirm prompt. Outcomes have their own visible region by the big button. */}
        <p role="status" className="sr-only">
          {armedLabel ? c.confirmAnnounce(armedLabel) : ""}
        </p>

        {!primary && secondary.length === 0 ? (
          <p className="mt-6 text-[17px] text-muted">{c.volunteer}</p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6">
            <PrimaryBar
              primary={primary}
              state={state}
              admin={admin}
              gate={gate}
              armed={primary ? armed(primary.labelKey) : false}
              // Always guarded, Stop voting included: it is where a double tap lands.
              onTap={() => primary && tap(primary.labelKey, primary.needsConfirm, () => void runPrimary(primary), true)}
              offset={admin.offset}
            />

            <SecondaryRow
              items={secondary.filter((s): s is Secondary & { key: Simple } => SIMPLE.has(s.key))}
              busy={admin.busy}
              gate={gate}
              armed={armed}
              onTap={(s) => tap(s.key, s.needsConfirm, () => void admin.act({ type: s.key }, v))}
            />

            {/* A volunteer's state carries no prompt data (see readAdminState): no panel rather than an empty one. */}
            {state.performanceId && state.phase !== "COMPLETED" && state.me.role !== "VOLUNTEER" && (
              <PromptPanel state={state} admin={admin} gate={gate} draw={has("drawPrompt")} type={has("setPrompt")} />
            )}

            {has("setSelfScore") && <OwnScorePanel key={state.performanceId ?? "none"} state={state} admin={admin} gate={gate} />}

            {has("reassignContestant") && (
              <ReassignPanel
                state={state}
                item={has("reassignContestant")!}
                busy={admin.busy}
                armed={armed}
                onReassign={(id) => tap(`reassign:${id}`, true, () => void admin.act({ type: "reassignContestant", contestantId: id }, v))}
              />
            )}
          </div>

          <Queue state={state} gate={gate} admin={admin} headingRef={queueHeading} />
        </div>
      </div>

      {setup && (
        <div hidden={shown !== "setup"}>
          <SetupPanel admin={admin} state={state} />
        </div>
      )}
    </div>
  );
}

/** The plain name of an armed control, for the confirm announcement. */
function armedName(key: string): string {
  const k = key.slice(0, key.lastIndexOf("@"));
  if (k.startsWith("reassign:")) return c.secondary.reassignContestant;
  return (c.primary as Record<string, string>)[k] ?? (c.secondary as Record<string, string>)[k] ?? k;
}

function TopBar({ admin, state }: { admin: UseAdmin; state: AdminState }) {
  const raw = formatRawAverage(state.rawAverage, state.votes);
  const stats: { label: string; value: React.ReactNode; wide?: boolean }[] = [
    { label: c.stats.contestant, value: state.contestant ?? c.stats.nobody, wide: true },
    { label: c.stats.phase, value: c.phases[state.phase] },
  ];
  if (state.phase === "PERFORMING" && state.endsAtMs !== null) {
    stats.push({ label: c.stats.timeLeft, value: <ActClock endsAtMs={state.endsAtMs} offset={admin.offset} /> });
  }
  stats.push({ label: c.stats.votes, value: state.votes });
  // A volunteer's state has these stripped (see readAdminState): zeros there would look like data.
  if (state.me.role !== "VOLUNTEER") {
    stats.push(
      { label: c.stats.rawAverage, value: raw ?? c.stats.noVotes },
      { label: c.stats.flagged, value: state.flagged },
      { label: c.stats.excluded, value: state.excluded },
      { label: c.stats.kiosk, value: state.kiosk },
    );
  }

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{DGL.name}</p>
          <h1 className="display text-[22px] font-semibold leading-tight">{c.heading}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionPill connection={admin.connection} />
          <p className="text-[15px] text-text">
            <span className="font-medium">{state.me.name}</span>
            <span className="text-muted">, {c.roles[state.me.role]}</span>
          </p>
          <button type="button" onClick={() => void admin.signOut()} className={cn(BTN, GHOST, "h-11 px-4 text-[15px]")}>
            <SignOut aria-hidden="true" weight="regular" className="size-5" />
            {c.signOut}
          </button>
        </div>
      </div>
      <dl className="glass grid grid-cols-2 gap-x-4 gap-y-3 rounded-panel p-4 sm:grid-cols-4 lg:grid-cols-8">
        {stats.map((s) => (
          <div key={s.label} className={cn("flex min-w-0 flex-col gap-1", s.wide && "col-span-2")}>
            <dt className="text-[13px] text-muted">{s.label}</dt>
            <dd className="break-words font-mono text-[17px] font-medium tabular-nums text-text [&_p]:text-[17px] [&_p]:text-text">{s.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

type PrimaryBarProps = {
  primary: Primary | null;
  state: AdminState;
  admin: UseAdmin;
  gate: Gate;
  armed: boolean;
  onTap(): void;
  offset: number;
};

/**
 * The one big "next" button, with the outcome note above it and the reason
 * under it when it is off. Fixed to the bottom of a phone screen (so it is
 * always under the thumb, whatever is scrolled into view); in the left
 * column at lg and up.
 */
function PrimaryBar({ primary, state, admin, gate, armed, onTap, offset }: PrimaryBarProps) {
  const off = !primary || primary.disabled || gate.blocked;
  const reason = gate.settling ? c.updating : primary?.disabledReason ? reasonText(primary.disabledReason) : "";
  const stale = admin.error === c.outcome.stale;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t border-hair bg-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0">
      <p className="flex flex-wrap items-center gap-x-3 font-mono text-[14px] tabular-nums text-muted lg:hidden">
        <span className="text-text">{c.phases[state.phase]}</span>
        <span>{DGL.copy.voteCount(state.votes)}</span>
        {state.phase === "PERFORMING" && state.endsAtMs !== null && <ActClock endsAtMs={state.endsAtMs} offset={offset} />}
      </p>

      <p role="status" aria-live="polite" className={cn("text-[15px] font-medium leading-snug", !admin.error && "sr-only", stale ? "text-yellow-hi" : "text-red-hi")}>
        {admin.error && (
          <span className="flex items-start gap-2">
            {stale ? (
              <Info aria-hidden="true" weight="regular" className="mt-[2px] size-5 shrink-0" />
            ) : (
              <WarningCircle aria-hidden="true" weight="regular" className="mt-[2px] size-5 shrink-0" />
            )}
            {admin.error}
          </span>
        )}
      </p>

      {primary && (
        <>
          <button
            type="button"
            onClick={() => !off && onTap()}
            aria-disabled={off || undefined}
            aria-describedby={reason ? gate.updatingId : undefined}
            className={cn(
              BTN,
              "min-h-16 w-full px-6 text-[19px] font-semibold",
              off ? OFF : primary.labelKey === "stopVoting" ? DANGER : PRIMARY,
              armed && ARMED,
            )}
          >
            {armed ? c.tapAgain : c.primary[primary.labelKey]}
          </button>
          {/* Always present and one line tall, so "Updating" coming and going never moves the layout. */}
          <p id={gate.updatingId} className="min-h-[1.5em] text-[15px] leading-[1.5] text-muted">
            {reason}
          </p>
        </>
      )}
    </div>
  );
}

const reasonText = (r: DisabledReason) => c.reason[r];

type SecondaryRowProps = {
  items: (Secondary & { key: Simple })[];
  busy: boolean;
  gate: Gate;
  armed(key: string): boolean;
  onTap(s: Secondary & { key: Simple }): void;
};

function SecondaryRow({ items, busy, gate, armed, onTap }: SecondaryRowProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label={c.secondaryTitle} className="flex flex-wrap gap-3">
      {items.map((s) => {
        const settling = !s.needsConfirm && gate.settling;
        const off = busy || settling;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => !off && onTap(s)}
            aria-disabled={off || undefined}
            aria-describedby={settling ? gate.updatingId : undefined}
            className={cn(BTN, "h-12 px-5 text-[15px]", off ? OFF : s.needsConfirm ? CAREFUL : GHOST, armed(s.key) && ARMED)}
          >
            {armed(s.key) ? c.tapAgain : c.secondary[s.key]}
          </button>
        );
      })}
    </section>
  );
}

function Panel({ title, titleId, children }: { title: string; titleId?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={titleId} className="glass flex flex-col gap-4 rounded-panel p-5">
      <h2 id={titleId} className="text-[17px] font-semibold text-text">
        {title}
      </h2>
      {children}
    </section>
  );
}

type PromptPanelProps = { state: AdminState; admin: UseAdmin; gate: Gate; draw: Secondary | null; type: Secondary | null };

/** The act's prompt: what is set now, "Draw prompt", and a field to type one from the spinwheel. */
function PromptPanel({ state, admin, gate, draw, type }: PromptPanelProps) {
  const ids = { title: useId(), input: useId(), error: useId(), hint: useId(), draw: useId() };
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = gate.blocked;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!gate.canTap()) return;
    const t = text.trim();
    if (!t) return setError(c.prompt.empty);
    setError(null);
    const r = await admin.act({ type: "setPrompt", text: t }, gate.version);
    if (r?.ok) setText("");
    else if (r && !r.ok && r.code === "invalid") setError(c.outcome.invalid);
  };

  const drawOff = busy || !!draw?.disabledReason;
  return (
    <Panel title={c.prompt.title} titleId={ids.title}>
      <p className={cn("break-words text-[17px] leading-snug", state.prompt ? "text-text" : "text-muted")}>{state.prompt ?? c.prompt.none}</p>
      {draw && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => !drawOff && gate.canTap() && void admin.act({ type: "drawPrompt" }, gate.version)}
            aria-disabled={drawOff || undefined}
            aria-describedby={draw.disabledReason ? ids.draw : gate.settling ? gate.updatingId : undefined}
            className={cn(BTN, "h-12 self-start px-5 text-[15px]", drawOff ? OFF : GHOST)}
          >
            {c.secondary.drawPrompt}
          </button>
          {draw.disabledReason && (
            <p id={ids.draw} className="text-[15px] text-muted">
              {reasonText(draw.disabledReason)}
            </p>
          )}
        </div>
      )}
      {type && (
        <form method="post" noValidate onSubmit={submit} className="flex flex-col gap-2">
          <label htmlFor={ids.input} className="text-[15px] font-medium text-text">
            {c.prompt.inputLabel}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id={ids.input}
              type="text"
              autoComplete="off"
              maxLength={c.prompt.maxLength}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${ids.hint} ${ids.error}`}
              className={cn(INPUT, "min-w-0 flex-1")}
            />
            <button type="submit" aria-disabled={busy || undefined} aria-describedby={gate.settling ? gate.updatingId : undefined} className={cn(BTN, "h-12 shrink-0 px-5 text-[15px]", busy ? OFF : GHOST)}>
              {c.secondary.setPrompt}
            </button>
          </div>
          <p id={ids.hint} className="text-[13px] text-muted">
            {c.prompt.hint} {text.length} / {c.prompt.maxLength}
          </p>
          <p id={ids.error} role="status" className={cn("text-[15px] text-red-hi", !error && "sr-only")}>
            {error}
          </p>
        </form>
      )}
    </Panel>
  );
}

/**
 * The contestant's own predicted score, 1 to 10: pick on the grid, then save.
 * Keyed by performance by the caller, so a new act starts unpicked.
 */
function OwnScorePanel({ state, admin, gate }: { state: AdminState; admin: UseAdmin; gate: Gate }) {
  const titleId = useId();
  const [pick, setPick] = useState<number | null>(null);
  const shown = pick ?? state.selfScore;
  const canSave = pick !== null && pick !== state.selfScore && !gate.blocked;

  const save = async () => {
    if (!canSave || pick === null || !gate.canTap()) return;
    const r = await admin.act({ type: "setSelfScore", score: pick }, gate.version);
    if (r?.ok) setPick(null);
  };

  return (
    <Panel title={c.ownScore.title} titleId={titleId}>
      <p className="-mt-2 text-[15px] leading-snug text-muted">{c.ownScore.hint}</p>
      <p className="font-mono text-[17px] font-medium tabular-nums text-text">
        {state.selfScore === null ? c.ownScore.none : c.ownScore.saved(state.selfScore)}
      </p>
      <ScoreGrid value={shown} onChange={setPick} labelledBy={titleId} />
      <button
        type="button"
        onClick={() => void save()}
        aria-disabled={!canSave || undefined}
        aria-describedby={gate.settling ? gate.updatingId : undefined}
        className={cn(BTN, "h-12 w-full px-5 text-[15px] sm:w-auto sm:self-start", canSave ? PRIMARY : OFF)}
      >
        {pick === null || pick === state.selfScore ? c.ownScore.pick : c.ownScore.save(pick)}
      </button>
    </Panel>
  );
}

type ReassignPanelProps = {
  state: AdminState;
  item: Secondary;
  busy: boolean;
  armed(key: string): boolean;
  onReassign(id: string): void;
};

/** Move the current act to another waiting contestant (prompt and timer stay). Needs a second tap. */
function ReassignPanel({ state, item, busy, armed, onReassign }: ReassignPanelProps) {
  const ids = { title: useId(), select: useId(), reason: useId() };
  const targets = reassignTargets(state);
  const [target, setTarget] = useState("");
  const chosen = targets.some((t) => t.id === target) ? target : (targets[0]?.id ?? "");
  const off = busy || !chosen;
  const isArmed = chosen !== "" && armed(`reassign:${chosen}`);

  return (
    <Panel title={c.secondary.reassignContestant} titleId={ids.title}>
      {item.disabledReason ? (
        <p className="text-[15px] text-muted">{reasonText(item.disabledReason)}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={ids.select} className="text-[15px] font-medium text-text">
            {c.reassign.label}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select id={ids.select} value={chosen} onChange={(e) => setTarget(e.target.value)} className={cn(INPUT, "min-w-0 flex-1 cursor-pointer")}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => !off && onReassign(chosen)}
              aria-disabled={off || undefined}
              className={cn(BTN, "h-12 shrink-0 px-5 text-[15px]", off ? OFF : CAREFUL, isArmed && ARMED)}
            >
              {isArmed ? c.tapAgain : c.reassign.button}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

const GROUPS: { status: ContestantStatus; label: string }[] = [
  { status: "current", label: c.queue.current },
  { status: "upcoming", label: c.queue.upcoming },
  { status: "done", label: c.queue.done },
];

type QueueProps = { state: AdminState; admin: UseAdmin; gate: Gate; headingRef: React.RefObject<HTMLHeadingElement | null> };

/** Every contestant, grouped on now / up next / done, with "Select" where selecting is possible. */
function Queue({ state, admin, gate, headingRef }: QueueProps) {
  const role = state.me.role;
  return (
    <section aria-labelledby="dgl-queue" className="glass flex min-w-0 flex-col gap-5 self-start rounded-panel p-5 lg:sticky lg:top-6">
      <h2 id="dgl-queue" ref={headingRef} tabIndex={-1} className="text-[17px] font-semibold text-text">
        {c.queue.title}
      </h2>
      {state.contestants.length === 0 ? (
        <p className="text-[15px] text-muted">{c.queue.empty}</p>
      ) : (
        GROUPS.map((g) => {
          const list = state.contestants.filter((k) => k.status === g.status);
          return (
            <div key={g.status} className="flex flex-col gap-2">
              <h3 className="text-[13px] font-medium text-muted">{g.label}</h3>
              {list.length === 0 ? (
                <p className="text-[15px] text-muted">{c.queue.none}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {list.map((k) => {
                    const action = queueAction(state, role, k.id);
                    return (
                      <li key={k.id} className="flex min-h-11 items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className={cn("line-clamp-2 break-words text-[15px]", k.active ? "text-text" : "text-muted")}>{k.name}</span>
                          {!k.active && <span className="text-[13px] text-muted">{c.queue.inactive}</span>}
                        </span>
                        {action === "select" && (
                          <button
                            type="button"
                            onClick={() => !gate.blocked && gate.canTap() && void admin.act({ type: "selectContestant", contestantId: k.id }, gate.version)}
                            aria-disabled={gate.blocked || undefined}
                            aria-describedby={gate.settling ? gate.updatingId : undefined}
                            className={cn(BTN, "h-11 shrink-0 px-4 text-[15px]", gate.blocked ? OFF : GHOST)}
                          >
                            {c.queue.select}
                            <span className="sr-only"> {k.name}</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
