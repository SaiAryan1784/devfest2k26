"use client";

import { useId, useRef, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import { canEditAdmin, formatAuditDetail, resetEnabled, type AdminEdit } from "@/lib/dgl/setup-view";
import type { UseAdmin } from "@/lib/dgl/use-admin";
import type { AdminState, Role } from "@/lib/dgl/types";
import { cn } from "@/lib/utils";
import { BTN, DANGER, GHOST, OFF, PRIMARY } from "./admin-styles";
import { INPUT } from "./AdminLogin";
import { ERROR, HINT, LABEL, NoteLine, Section, useSetupAct } from "./setup-parts";

const c = DGL.copy.admin;
const s = c.setup;
const a = s.admins;
const ROLES: Role[] = ["SUPER_ADMIN", "OPERATOR", "HOST", "VOLUNTEER"];

type AdminRow = NonNullable<AdminState["admins"]>[number];

/** A visible warning line for a destructive step. */
function Warning({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-2 text-[15px] font-medium leading-snug text-yellow-hi">
      <WarningCircle aria-hidden="true" weight="regular" className="mt-[2px] size-5 shrink-0" />
      {children}
    </p>
  );
}

/**
 * Admins (SUPER_ADMIN): the list, an add form, and an inline edit per row
 * (role, active, new passcode). What the server would refuse for you is
 * disabled with the reason shown (canEditAdmin); anything else it refuses
 * reads "That change is not allowed." Passcodes live only in uncontrolled
 * inputs: read once on submit, sent, and the field is cleared after every
 * attempt. They never enter React state and are never logged.
 */
export function AdminsSection({ admin, state, admins }: { admin: UseAdmin; state: AdminState; admins: AdminRow[] }) {
  const ids = { title: useId(), name: useId(), role: useId(), pass: useId(), passHint: useId(), err: useId() };
  const { note, run, mounted } = useSetupAct(admin);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("HOST");
  const [error, setError] = useState<string | null>(null);
  const pass = useRef<HTMLInputElement>(null);
  const off = admin.busy;

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (off) return;
    const passcode = pass.current?.value ?? "";
    if (pass.current) pass.current.value = "";
    const n = name.trim();
    if (!n) return setError(a.nameMissing);
    if (passcode.length < a.passcodeMin) return setError(a.passcodeShort);
    setError(null);
    const r = await run({ type: "upsertAdmin", name: n, role, passcode, active: true }, a.added(n), { invalid: s.notAllowed });
    if (r?.ok && mounted.current) {
      setName("");
      setRole("HOST");
    }
  };

  return (
    <Section id={ids.title} title={a.title} body={a.body}>
      <ul className="flex flex-col gap-1">
        {admins.map((row) => {
          const flags = canEditAdmin(state.me, row, admins);
          return editing === row.id ? (
            <li key={row.id}>
              <AdminEditForm
                row={row}
                flags={flags}
                off={off}
                onCancel={() => setEditing(null)}
                onSave={async (next) => {
                  const r = await run({ type: "upsertAdmin", id: row.id, name: row.name, ...next }, s.saved, { invalid: s.notAllowed });
                  if (r?.ok && mounted.current) setEditing(null);
                }}
              />
            </li>
          ) : (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1">
              <span className="min-w-0 flex-1 basis-40">
                <span className={cn("break-words text-[15px]", row.active ? "text-text" : "text-muted")}>{row.name}</span>
                {flags.self && <span className="ml-2 text-[13px] text-muted">{a.you}</span>}
              </span>
              <span className="w-28 text-[15px] text-muted">{c.roles[row.role]}</span>
              <span className={cn("w-20 text-[15px]", row.active ? "text-text" : "text-muted")}>{row.active ? s.active : s.inactive}</span>
              <button type="button" onClick={() => !off && setEditing(row.id)} aria-disabled={off || undefined} className={cn(BTN, "h-11 px-4 text-[15px]", off ? OFF : GHOST)}>
                {s.edit}
                <span className="sr-only"> {row.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <form method="post" noValidate onSubmit={add} className="flex flex-col gap-3 pt-2" aria-describedby={error ? ids.err : undefined}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={ids.name} className={LABEL}>
              {a.name}
            </label>
            <input
              id={ids.name}
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={a.nameMax}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={ids.role} className={LABEL}>
              {a.role}
            </label>
            <select id={ids.role} value={role} onChange={(e) => setRole(e.target.value as Role)} className={cn(INPUT, "cursor-pointer")}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {c.roles[r]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={ids.pass} className={LABEL}>
              {a.passcode}
            </label>
            <input
              ref={pass}
              id={ids.pass}
              name="new-admin-passcode"
              type="password"
              autoComplete="new-password"
              maxLength={a.passcodeMax}
              aria-describedby={ids.passHint}
              className={INPUT}
            />
          </div>
        </div>
        <p id={ids.passHint} className={HINT}>
          {a.passcodeHint}
        </p>
        {error && (
          <p id={ids.err} className={ERROR}>
            {error}
          </p>
        )}
        <button type="submit" aria-disabled={off || undefined} className={cn(BTN, "h-12 self-start px-5 text-[15px]", off ? OFF : PRIMARY)}>
          {a.add}
        </button>
      </form>
      <NoteLine note={note} />
    </Section>
  );
}

type AdminEditProps = {
  row: AdminRow;
  flags: AdminEdit;
  off: boolean;
  onCancel(): void;
  onSave(next: { role: Role; active: boolean; passcode?: string }): Promise<void>;
};

/** One admin's role, status and passcode. Your own row and the last active super admin are locked, with the reason shown. */
function AdminEditForm({ row, flags, off, onCancel, onSave }: AdminEditProps) {
  const ids = { role: useId(), active: useId(), lock: useId(), warn: useId(), pass: useId(), passHint: useId(), err: useId() };
  const [role, setRole] = useState<Role>(row.role);
  const [active, setActive] = useState(row.active);
  const [error, setError] = useState<string | null>(null);
  const pass = useRef<HTMLInputElement>(null);
  const lock = flags.self ? a.selfLocked : flags.lastSuper ? a.lastSuperLocked : null;
  const deactivating = row.active && !active;

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (off) return;
    const passcode = pass.current?.value ?? "";
    if (pass.current) pass.current.value = "";
    if (passcode && passcode.length < a.passcodeMin) return setError(a.passcodeShort);
    setError(null);
    void onSave({ role, active, ...(passcode && { passcode }) });
  };

  return (
    <form method="post" noValidate onSubmit={save} aria-label={a.editLabel(row.name)} className="flex flex-col gap-3 rounded-card bg-white/[0.03] p-4">
      <p className="text-[15px] font-medium text-text">{row.name}</p>
      {lock && (
        <p id={ids.lock} className={HINT}>
          {lock}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={ids.role} className={LABEL}>
            {a.role}
          </label>
          <select
            id={ids.role}
            value={role}
            disabled={!flags.canChangeRole}
            onChange={(e) => setRole(e.target.value as Role)}
            aria-describedby={lock ? ids.lock : undefined}
            className={cn(INPUT, flags.canChangeRole ? "cursor-pointer" : "cursor-not-allowed text-muted")}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {c.roles[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className={LABEL}>{a.status}</span>
          <label htmlFor={ids.active} className={cn("flex min-h-12 items-center gap-3 text-[15px]", flags.canDeactivate ? "cursor-pointer text-text" : "cursor-not-allowed text-muted")}>
            <input
              id={ids.active}
              type="checkbox"
              checked={active}
              disabled={!flags.canDeactivate}
              onChange={(e) => setActive(e.target.checked)}
              aria-describedby={[lock ? ids.lock : "", deactivating ? ids.warn : ""].join(" ").trim() || undefined}
              className="size-5 shrink-0 accent-blue"
            />
            {s.active}
          </label>
        </div>
      </div>
      {deactivating && <Warning id={ids.warn}>{a.deactivateWarning}</Warning>}
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={ids.pass} className={LABEL}>
          {a.newPasscode}
        </label>
        <input
          ref={pass}
          id={ids.pass}
          name="reset-admin-passcode"
          type="password"
          autoComplete="new-password"
          maxLength={a.passcodeMax}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${ids.passHint}${error ? ` ${ids.err}` : ""}`}
          className={INPUT}
        />
        <p id={ids.passHint} className={HINT}>
          {a.newPasscodeHint}
        </p>
        {error && (
          <p id={ids.err} className={ERROR}>
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-disabled={off || undefined} className={cn(BTN, "h-11 px-5 text-[15px]", off ? OFF : deactivating ? DANGER : PRIMARY)}>
          {s.save}
        </button>
        <button type="button" onClick={onCancel} className={cn(BTN, GHOST, "h-11 px-5 text-[15px]")}>
          {s.cancel}
        </button>
      </div>
    </form>
  );
}

type ModerationRow = NonNullable<AdminState["moderation"]>[number];

/**
 * Moderation (SUPER_ADMIN): the newest performances with votes, each with
 * its flagged count and one toggle. setFlaggedExcluded flips `excluded` on
 * that performance's flagged votes, so `excluded > 0` means they are out.
 */
export function ModerationSection({ admin, rows }: { admin: UseAdmin; rows: ModerationRow[] }) {
  const ids = { title: useId(), none: useId() };
  const { note, run } = useSetupAct(admin);
  const m = s.moderation;
  const busy = admin.busy;

  return (
    <Section id={ids.title} title={m.title} body={m.body}>
      {rows.length === 0 ? (
        <p className="text-[15px] text-muted">{m.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => {
            const out = row.excluded > 0;
            const none = row.flagged === 0;
            const off = busy || none;
            return (
              <li key={row.performanceId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1">
                <span className="min-w-0 flex-1 basis-40 break-words text-[15px] text-text">{row.contestant}</span>
                <span className="flex gap-4 font-mono text-[15px] tabular-nums text-muted">
                  <span>
                    {m.votes} <span className="text-text">{row.votes}</span>
                  </span>
                  <span>
                    {m.flagged} <span className="text-text">{row.flagged}</span>
                  </span>
                  <span>
                    {m.excluded} <span className="text-text">{row.excluded}</span>
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => !off && void run({ type: "setFlaggedExcluded", performanceId: row.performanceId, excluded: !out }, s.saved)}
                  aria-disabled={off || undefined}
                  aria-describedby={none ? ids.none : undefined}
                  className={cn(BTN, "h-11 px-4 text-[15px]", off ? OFF : GHOST)}
                >
                  {none ? m.noFlagged : out ? m.include : m.exclude}
                  <span className="sr-only"> {m.forAct(row.contestant)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p id={ids.none} className="sr-only">
        {m.noFlagged}
      </p>
      <NoteLine note={note} />
    </Section>
  );
}

/** Audit times in the venue's zone with a fixed locale, so every device shows the same clock. */
const TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Audit log (SUPER_ADMIN): the last 50 entries, newest first, as compact rows in a scrollable region. */
export function AuditSection({ entries }: { entries: NonNullable<AdminState["audit"]> }) {
  const id = useId();
  const l = s.audit;
  return (
    <Section id={id} title={l.title} body={l.body}>
      {entries.length === 0 ? (
        <p className="text-[15px] text-muted">{l.empty}</p>
      ) : (
        <ol tabIndex={0} aria-labelledby={id} className="flex max-h-[480px] flex-col gap-2 overflow-y-auto pr-2">
          {entries.map((e, i) => {
            const detail = formatAuditDetail(e.detail);
            return (
              <li key={`${e.at}-${i}`} className="flex flex-col gap-0.5 py-1">
                <span className="flex flex-wrap items-baseline gap-x-3 text-[15px]">
                  <time dateTime={new Date(e.at).toISOString()} className="font-mono text-[13px] tabular-nums text-muted">
                    {TIME.format(e.at)}
                  </time>
                  <span className="text-text">{e.adminName}</span>
                  <span className="font-mono text-[13px] text-blue-hi">{e.action}</span>
                </span>
                {detail && <span className="break-words font-mono text-[13px] text-muted">{detail}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

/**
 * Reset show (SUPER_ADMIN): clears rehearsal data. The button is enabled
 * only once the field says exactly RESET; the action carries the version
 * this view shows, so a reset from an outdated screen comes back stale.
 */
export function ResetSection({ admin, state }: { admin: UseAdmin; state: AdminState }) {
  const ids = { title: useId(), input: useId(), warn: useId() };
  const { note, run } = useSetupAct(admin);
  const [typed, setTyped] = useState("");
  const r = s.reset;
  const on = resetEnabled(typed) && !admin.busy;

  const reset = async () => {
    if (!on) return;
    setTyped("");
    await run({ type: "resetShow", confirm: "RESET" }, r.done, { version: state.version });
  };

  return (
    <Section id={ids.title} title={r.title} body={r.body}>
      <Warning id={ids.warn}>{r.warning}</Warning>
      <div className="flex flex-col gap-2">
        <label htmlFor={ids.input} className={LABEL}>
          {r.label}
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={ids.input}
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-describedby={ids.warn}
            className={cn(INPUT, "font-mono sm:max-w-60")}
          />
          <button
            type="button"
            onClick={() => void reset()}
            aria-disabled={!on || undefined}
            aria-describedby={ids.warn}
            className={cn(BTN, "h-12 shrink-0 px-5 text-[15px]", on ? DANGER : OFF)}
          >
            {r.button}
          </button>
        </div>
      </div>
      <NoteLine note={note} />
    </Section>
  );
}
