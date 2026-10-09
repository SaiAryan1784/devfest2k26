"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info, SignOut, WarningCircle } from "@phosphor-icons/react";
import { DGL, type Track } from "@/data/dgl";
import {
  confirmStep,
  formatRawAverage,
  primaryAction,
  secondaryActions,
  tapAllowed,
  type DisabledReason,
  type Pending,
  type Primary,
  type Secondary,
  type SecondaryKey,
} from "@/lib/dgl/admin-view";
import { formatRaw } from "@/lib/dgl/score";
import { setupSections } from "@/lib/dgl/setup-view";
import { useAdmin, type UseAdmin } from "@/lib/dgl/use-admin";
import type { AdminState } from "@/lib/dgl/types";
import { cn } from "@/lib/utils";
import { ActClock } from "./ActClock";
import { ARMED, BTN, CAREFUL, DANGER, GHOST, OFF, PRIMARY } from "./admin-styles";
import { AdminLogin, INPUT } from "./AdminLogin";
import { ConnectionPill } from "./ConnectionPill";
import { ScoreGrid } from "./ScoreGrid";
import { SetupPanel, ViewSwitch, type View } from "./SetupPanel";
import { TrackLabel, TrackSwitcher, rememberTrack, rememberedTrack } from "./TrackSwitcher";

const c = DGL.copy.admin;
const CONFIRM_MS = 3000;

/** Secondary controls that are plain buttons (the rest are the rename and own score panels). */
type Simple = "pauseVoting" | "resumeVoting" | "stopVoting" | "reopenVoting" | "spinWheel" | "showWinner" | "hideWinner";
const SIMPLE = new Set<SecondaryKey>(["pauseVoting", "resumeVoting", "stopVoting", "reopenVoting", "spinWheel", "showWinner", "hideWinner"]);

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
 *
 * Three tracks run at once. An all-track account picks one (remembered for
 * the tab); the console below is keyed by it, so no confirm, settle or
 * in-flight state leaks from one track into another. A track account is
 * pinned to its own by the server.
 */
export function AdminConsole() {
  const [track, setTrack] = useState<Track | null>(null);
  useEffect(() => {
    const saved = rememberedTrack();
    // Read after mount, never while rendering: storage does not exist on the server, so the first render must not depend on it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setTrack(saved);
  }, []);
  return (
    <TrackConsole
      key={track ?? "default"}
      track={track}
      onTrack={(t) => {
        rememberTrack(t);
        setTrack(t);
      }}
    />
  );
}

function TrackConsole({ track, onTrack }: { track: Track | null; onTrack(t: Track): void }) {
  const admin = useAdmin(track);
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
  return <Console admin={admin} state={admin.state} onTrack={onTrack} />;
}

function Console({ admin, state, onTrack }: { admin: UseAdmin; state: AdminState; onTrack(t: Track): void }) {
  const role = state.me.role;
  const primary = primaryAction(state, role);
  const secondary = secondaryActions(state, role);
  const has = (k: SecondaryKey) => secondary.find((s) => s.key === k) ?? null;
  const nameField = useRef<HTMLInputElement>(null);
  // The name typed for the next act; cleared once the server puts it on stage.
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
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
  const runPrimary = async (p: Primary) => {
    if (!p.action) {
      // Put on stage: the name field is the action's input.
      const n = name.trim();
      if (!n) {
        setNameError(c.stage.nameMissing);
        nameField.current?.focus();
        return;
      }
      setNameError(null);
      const r = await admin.act({ type: "putOnStage", name: n }, v);
      if (r?.ok) setName("");
      return;
    }
    await admin.act(p.action, v);
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
      <TopBar admin={admin} state={state} onTrack={onTrack} />
      {setup && <ViewSwitch view={shown} onChange={setView} />}

      <div hidden={shown !== "live"}>
        {/* Screen reader only: the confirm prompt. Outcomes have their own visible region by the big button. */}
        <p role="status" className="sr-only">
          {armedLabel ? c.confirmAnnounce(armedLabel) : ""}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-8">
          <div className="flex min-w-0 flex-col gap-6">
            {primary?.labelKey === "putOnStage" && (
              <NameForm
                inputRef={nameField}
                value={name}
                onChange={(t) => {
                  setName(t);
                  if (nameError) setNameError(null);
                }}
                error={nameError}
                onSubmit={() => primary && tap(primary.labelKey, false, () => void runPrimary(primary), true)}
              />
            )}

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
              spun={state.spunAtMs !== null}
              busy={admin.busy}
              gate={gate}
              armed={armed}
              onTap={(s) => tap(s.key, s.needsConfirm, () => void admin.act({ type: s.key }, v))}
            />

            {state.performanceId && state.phase !== "COMPLETED" && <PromptLine state={state} />}

            {has("renameAct") && <RenamePanel key={state.performanceId ?? "none"} state={state} admin={admin} gate={gate} />}

            {has("setSelfScore") && <OwnScorePanel key={state.performanceId ?? "none"} state={state} admin={admin} gate={gate} />}
          </div>

          <ActsPanel state={state} />
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
  return (c.primary as Record<string, string>)[k] ?? (c.secondary as Record<string, string>)[k] ?? k;
}

function TopBar({ admin, state, onTrack }: { admin: UseAdmin; state: AdminState; onTrack(t: Track): void }) {
  const raw = formatRawAverage(state.rawAverage, state.votes);
  const stats: { label: string; value: React.ReactNode; wide?: boolean }[] = [
    { label: c.stats.contestant, value: state.contestant ?? c.stats.nobody, wide: true },
    { label: c.stats.phase, value: c.phases[state.phase] },
  ];
  if (state.phase === "PERFORMING" && state.endsAtMs !== null) {
    stats.push({ label: c.stats.timeLeft, value: <ActClock endsAtMs={state.endsAtMs} offset={admin.offset} /> });
  }
  stats.push({ label: c.stats.votes, value: state.votes });
  stats.push(
    { label: c.stats.rawAverage, value: raw ?? c.stats.noVotes },
    { label: c.stats.flagged, value: state.flagged },
    { label: c.stats.excluded, value: state.excluded },
    { label: c.stats.kiosk, value: state.kiosk },
  );

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
      {state.me.track === null ? <TrackSwitcher value={state.track} onChange={onTrack} /> : <TrackLabel track={state.track} />}
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
  /** This act has been spun already: the wheel button reads "Spin again". */
  spun: boolean;
  busy: boolean;
  gate: Gate;
  armed(key: string): boolean;
  onTap(s: Secondary & { key: Simple }): void;
};

function SecondaryRow({ items, spun, busy, gate, armed, onTap }: SecondaryRowProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label={c.secondaryTitle} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-3">
        {items.map((s) => {
          const settling = !s.needsConfirm && gate.settling;
          const off = busy || settling || !!s.disabledReason;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => !off && onTap(s)}
              aria-disabled={off || undefined}
              aria-describedby={settling ? gate.updatingId : undefined}
              className={cn(BTN, "h-12 px-5 text-[15px]", off ? OFF : s.key === "showWinner" ? PRIMARY : s.needsConfirm ? CAREFUL : GHOST, armed(s.key) && ARMED)}
            >
              {armed(s.key) ? c.tapAgain : s.key === "spinWheel" && spun ? c.spinAgain : c.secondary[s.key]}
            </button>
          );
        })}
      </div>
      {items.map((s) => s.disabledReason && (
        <p key={s.key} className="text-[15px] text-muted">
          {reasonText(s.disabledReason)}
        </p>
      ))}
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

/** Who is on stage next: the name field above the big "Put on stage" button. Enter submits through the same guarded tap. */
function NameForm({
  inputRef,
  value,
  onChange,
  error,
  onSubmit,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange(t: string): void;
  error: string | null;
  onSubmit(): void;
}) {
  const ids = { input: useId(), hint: useId(), err: useId() };
  return (
    <form
      method="post"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="glass flex flex-col gap-2 rounded-panel p-5"
    >
      <label htmlFor={ids.input} className="text-[17px] font-semibold text-text">
        {c.stage.nameLabel}
      </label>
      <input
        ref={inputRef}
        id={ids.input}
        type="text"
        autoComplete="off"
        maxLength={c.stage.nameMax}
        placeholder={c.stage.namePlaceholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${ids.hint} ${ids.err}`}
        className={INPUT}
      />
      <p id={ids.hint} className="text-[13px] text-muted">
        {c.stage.nameHint}
      </p>
      <p id={ids.err} role="status" className={cn("text-[15px] text-red-hi", !error && "sr-only")}>
        {error}
      </p>
    </form>
  );
}

/** The wheel's prompt for this act, or the nudge to spin when it has none. */
function PromptLine({ state }: { state: AdminState }) {
  return (
    <Panel title={c.stage.promptTitle}>
      <p className={cn("break-words text-[17px] leading-snug", state.prompt ? "text-text" : "text-muted")}>{state.prompt ?? c.stage.promptNone}</p>
    </Panel>
  );
}

/** Fix a typo in the name (keyed by act, so a new act starts from its own name). */
function RenamePanel({ state, admin, gate }: { state: AdminState; admin: UseAdmin; gate: Gate }) {
  const ids = { title: useId(), input: useId() };
  const [text, setText] = useState(state.contestant ?? "");
  const [error, setError] = useState<string | null>(null);
  const changed = text.trim() !== "" && text.trim() !== (state.contestant ?? "");

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!gate.canTap() || !changed) return;
    const r = await admin.act({ type: "renameAct", name: text.trim() }, gate.version);
    if (r && !r.ok && r.code === "invalid") setError(c.outcome.invalid);
    else setError(null);
  };

  return (
    <Panel title={c.secondary.renameAct} titleId={ids.title}>
      <form method="post" noValidate onSubmit={save} className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={ids.input} className="sr-only">
          {c.stage.renameLabel}
        </label>
        <input
          id={ids.input}
          type="text"
          autoComplete="off"
          maxLength={c.stage.nameMax}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={cn(INPUT, "min-w-0 flex-1")}
        />
        <button type="submit" aria-disabled={!changed || gate.blocked || undefined} className={cn(BTN, "h-12 shrink-0 px-5 text-[15px]", changed && !gate.blocked ? GHOST : OFF)}>
          {c.stage.renameSave}
        </button>
      </form>
      {error && <p role="status" className="text-[15px] text-red-hi">{error}</p>}
    </Panel>
  );
}

/** Every act of the track so far with its score. Staff only: the exact average to two decimals is here and nowhere public. */
function ActsPanel({ state }: { state: AdminState }) {
  const lead = new Set(state.leaders?.names ?? []);
  return (
    <section aria-labelledby="dgl-acts" className="glass flex min-w-0 flex-col gap-4 self-start rounded-panel p-5 lg:sticky lg:top-6">
      <h2 id="dgl-acts" className="text-[17px] font-semibold text-text">
        {c.acts.title}
      </h2>
      {state.winnerShown && <p className="text-[15px] font-medium text-yellow-hi">{c.acts.shown}</p>}
      {state.acts.length === 0 ? (
        <p className="text-[15px] text-muted">{c.acts.empty}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {state.acts.map((a) => (
            <li key={a.performanceId} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 basis-32">
                <span className="line-clamp-2 break-words text-[15px] text-text">{a.name || "-"}</span>
                {a.revealed && lead.has(a.name) && <span className="text-[13px] text-yellow-hi">{c.acts.leading}</span>}
              </span>
              <span className="font-mono text-[15px] tabular-nums text-muted">
                {a.audience === null ? c.acts.noVotes : `${a.audience} / 10 (${formatRaw(a.exact as number)})`}
                {a.audience !== null && `, ${c.acts.votes(a.votes)}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
