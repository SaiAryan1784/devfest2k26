# DGL Tracks and Event-Day Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three simultaneous track shows (build, grow, think) where the host types each act's name, spins a wheel for a prompt, and ends with a winner screen; whole-number scores, a seconds timer, a full-width banner on the stage with the QR code shown only once the act has started, and a refined phone voting screen.

**Architecture:** The existing DGL feature (Neon Postgres over HTTP, one-statement writes, polling clients behind a CDN-cached state endpoint) gains a `track` key. Show state moves from the single `dgl_show` row to one `dgl_tracks` row per track; every show read and write, the vote and kiosk statements, the admin session (an admin may be locked to one track) and every client hook take the track. Acts carry their typed name; contestants stop being used. The schema change is additive and idempotent and runs through the existing `ensureSchema` probe.

**Tech Stack:** Next.js 16 App Router, `@neondatabase/serverless`, Tailwind v4 tokens, Motion (`m.*` only under /dgl), vitest on PGlite, `sharp` (already a devDependency) for the banner script. New dependency: `canvas-confetti` plus `@types/canvas-confetti` (Task 6 only).

**Spec:** `docs/superpowers/specs/2026-10-09-dgl-tracks.md` (design and rulings). Existing feature: `docs/SPEC.md` section 38, `docs/dgl-runbook.md`, `CLAUDE.md` DGL rules.

**Timeline:** the event is 10 Oct 2026, the day after this plan. Tasks 1 to 4 are the core and ship first; 5 to 7 build on them; 8 closes.

## Global Constraints

- This is not the Next.js you know (`AGENTS.md`): read the relevant doc under `node_modules/next/dist/docs/01-app/` before writing a route handler, a dynamic route (`[track]`, `generateStaticParams`, `dynamicParams`) or metadata.
- Track slugs are exactly `build`, `grow`, `think`; labels `Build`, `Grow`, `Think`. Admin roles are exactly `SUPER_ADMIN` and `HOST`; an admin has `track: Track | null` (null means all tracks). The audience is not a role.
- Audience score is a whole number: `Math.round(exact average)` (8.4 gives 8, 8.5 gives 9, 8.49 gives 8). The difference is the whole-number gap; "Perfect match" means the two numbers are equal. There is no minimum number of votes (`DGL.minVotes` is removed). With zero counted votes there is no audience score. Staff (admin console) still see the exact average to two decimals.
- The clock reads whole seconds, rounded up, with a unit: `90` and `sec`, never `1:30`; at 0 it reads the existing "Time" copy. The last 10 s are yellow, the last 3 s red (unchanged).
- Stage QR code (and its URL line): visible only while the phase is PERFORMING, PERFORMED, VOTING or VOTING_PAUSED; hidden in every other phase, while the wheel spins, and on the winner screen.
- Wheel: `DGL.wheel = { spinMs: 4500, segments: 12 }`. `spinWheel` is allowed in READY only, stores the prompt and the server time of the spin (`spun_at`); clients hide the prompt until `spun_at + spinMs` in server time. Prompts are optional: `startPerformance` never needs one.
- All DGL facts and copy live in `src/data/dgl.ts`; components never hardcode a string a person reads, a number or a limit. Copy: sentence case, no em or en dashes (`grep -rnE "—|–" src/ tests/ scripts/ docs/dgl-runbook.md` must find none in lines you add), one label per CTA intent.
- Every show write is ONE SQL statement (data-modifying CTEs) with its audit row in that same statement; timestamps come from the `now` argument, never `Date.now()` or SQL `now()` inside the lib; no raw IPs or passcodes stored or logged. `/api/dgl/state` must never set a cookie and keeps `CDN-Cache-Control: max-age=1, stale-while-revalidate=2`. "Vote recorded" only after the server confirms (the honesty rule in `vote-queue.ts` is untouched).
- `/dgl` runs under `LazyMotion strict`: use `m.*`, never `motion.*`, and never import `ui/Button` or `brand/Lockup` (use `StaticLockup` and the classes in `admin-styles.ts`). A Motion `initial`/`animate`/`while*` value never branches on `useReducedMotion()`; only `transition` may. Continuous values use MotionValues, not state. No `backdrop-filter` (use `.glass`), no WebGL. Tokens only from `globals.css` `@theme`; radius panels 24, cards 20, inputs 12, buttons pill; Phosphor regular icons only; touch targets at least 44 px; AA contrast.
- Tests: vitest on PGlite, every test file imports `test`, `expect` and friends from `"vitest"` explicitly (`next build` typechecks tests). Write the failing test first and record RED then GREEN. Run focused tests while iterating, then `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` before the last commit of a task (lint has one old warning in `reactbits/ShinyText`).
- Nothing here can be seen in a browser (Playwright is not installed; do not install it): reason UI changes through carefully and label them "reasoned only" in the report.
- Branch `feat/dgl-tracks`. Never push, never read or edit `.env`, never run `scripts/dgl-admin.ts` or `scripts/dgl-load-check.mjs` against a real database or host. Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A database that already has the shipped schema and data** (legacy OPERATOR and VOLUNTEER admins, performances with a contestant id and no track, the single `dgl_show` row). Expected: the app comes up, nothing 500s, legacy admins sign in as HOST with all tracks, legacy acts are invisible in every track. Pinned by `migration.test.ts` (Tasks 2 and 3).
2. **Leakage between tracks.** Expected: votes, `/me`, state, kiosk votes, moderation, reset and versions never touch another track; a track admin is refused (403, nothing written) in any other track. Pinned by the isolation and lock tests in Task 3.
3. **The prompt shown before the wheel stops, a double spin, a spin after the act started.** Expected: clients hide the prompt until the spin ends in server time, a second spin replaces the first, spin outside READY is `not_allowed`. Pinned by `spinState` tests and the `spinWheel` tests in Task 2.
4. **Winner correctness.** Expected: excluded votes do not count, acts with no counted votes never win, unrevealed acts never win, an exact tie shows every tied act, the winner screen follows moderation changes. Pinned by `winnersOf` and show tests in Task 5.
5. **Rounding and clock boundaries.** Expected: 8.5 gives 9 and 8.49 gives 8; 89.001 s reads 90; 0.4 s reads 1; 0 reads Time; 10.000 s is yellow, 3.000 s red. Pinned by Task 1 tests.

---

### Task 1: Whole-number scores, no vote minimum, seconds timer

**Files:**
- Modify: `src/lib/dgl/score.ts`, `src/lib/dgl/audience-view.ts`, `src/lib/dgl/stage-timer.ts`, `src/data/dgl.ts`, `src/components/dgl/AudienceView.tsx`, `src/components/dgl/ActClock.tsx`, `src/components/dgl/StageTimer.tsx`, `src/components/dgl/Reveal.tsx`, `src/lib/dgl/admin-view.ts` (only where it formats the staff raw average)
- Test: `tests/dgl/score.test.ts`, `tests/dgl/audience-view.test.ts`, `tests/dgl/stage-timer.test.ts`, plus every assertion in `tests/dgl/show.test.ts`, `tests/dgl/routes.test.ts`, `tests/dgl/stage-view.test.ts` that depends on a 5-vote minimum or a one-decimal average

**Interfaces:**
- Produces:
  - `publicAverage(avg: number | null, count: number): number | null`: null when `avg` is null or `count < 1`, else `Math.round(avg)`.
  - `compareScores(self: number, audience: number | null): Comparison`: `{ kind: "insufficient" }` for null, `{ kind: "match" }` when equal, else `{ kind: "diff", diff: number }` with an integer `diff`.
  - `formatRaw(avg: number): string`: two decimals (`8.64`), staff only; `formatAverage` is removed.
  - `formatClock(ms: number): string`: `String(Math.max(0, Math.ceil(ms / 1000)))`.
  - `DGL.copy`: `secondsUnit: "sec"`, `outOfTen: (n: number) => string` (`8 / 10`), `difference: (d: number) => string`, `noVotes: "No votes"` (replaces `notEnoughVotes`); `waitingForAudience` stays; `DGL.minVotes` is deleted.

- [ ] **Step 1: Write the failing tests** (names and assertions):
  - `score.test.ts`: `publicAverage rounds half up to a whole number` (`(8.5, 1)` is 9, `(8.49, 3)` is 8, `(8.4999999, 7)` is 8, `(1, 1)` is 1, `(10, 1)` is 10); `publicAverage is null only with no votes` (`(9, 0)` and `(null, 3)` are null; `(9, 1)` is 9, so a single vote counts); `compareScores is whole numbers` (`(8, 8)` match, `(9, 7)` diff 2, `(3, 9)` diff 6, `(9, null)` insufficient); `formatRaw keeps two decimals` (`8.64`, `8` gives `8.00`).
  - `audience-view.test.ts`: `formatClock counts whole seconds up` (`90_000` is `"90"`, `89_001` `"90"`, `89_000` `"89"`, `9_400` `"10"`, `1` `"1"`, `0` and `-5` `"0"`); `revealLines with no votes says No votes` (`audience: null`, `verdict: DGL.copy.noVotes`); `revealLines whole numbers` (self 7, audience 9 gives audience `"9 / 10"`, verdict `"Difference 2"`; equal gives `DGL.copy.perfectMatch`); the tally line shows `Waiting for audience...` for zero votes while voting and `No votes` once closed.
  - `stage-timer.test.ts`: keep every boundary test (10.000 s final, 9.999 s final, 3.000 s critical, 2.999 s critical, 0 and negative) and change the expected text from `0:10` style to `10`; `clockText(0)` is `DGL.copy.stageTime`.
  - `show.test.ts`: `a single vote is the public average` (one vote of 10 gives `average: 10`, no minimum); `average is a whole number` (votes 8 and 9 give 9; 8 and 8 and 9 give 8); `no votes gives a null average and reveal audience null`; reveal results use whole-number `diff`.
- [ ] **Step 2:** Run `npm test` and confirm the new tests FAIL for the right reason.
- [ ] **Step 3:** Implement the interfaces above. UI: `ActClock` (phone) renders the digits and `DGL.copy.secondsUnit` ("90 sec"); `StageTimer` renders the big digits with a smaller "sec" label beside or under them and keeps its tone and ring logic; `Reveal` counts up whole numbers (the displayed MotionValue text is `Math.round(v)`), and its settled text is exactly `String(audience)`; `AudienceView` `TallyLine` uses `outOfTen(n)` and the zero-vote rule above. Staff raw average in the admin console keeps two decimals through `formatRaw`.
- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; all pass. Grep that `minVotes`, `formatAverage` and `notEnoughVotes` no longer appear in `src/` or `tests/`.
- [ ] **Step 5:** Commit `feat(dgl): whole-number audience score, no vote minimum, seconds timer`.

---

### Task 2: Acts by name, two roles, spin the wheel

**Files:**
- Modify: `src/lib/dgl/types.ts`, `machine.ts`, `schema.ts`, `show.ts`, `auth.ts`, `clock.ts`, `admin-view.ts`, `setup-view.ts`, `kiosk-view.ts`, `audience-view.ts`, `stage-view.ts`, `use-admin.ts`; `src/app/api/dgl/admin/action/route.ts`; `src/data/dgl.ts`; `scripts/dgl-admin.ts`; `src/components/dgl/AdminConsole.tsx`, `SetupPanel.tsx`, `SetupAdmins.tsx`, `setup-parts.tsx`, `KioskView.tsx`, `AudienceView.tsx`, `StageView.tsx`
- Create: `src/lib/dgl/wheel.ts`, `src/lib/dgl/use-spin.ts`, `tests/dgl/fixtures/schema-v1.ts` (the current `SCHEMA` DDL, frozen), `tests/dgl/wheel.test.ts`, `tests/dgl/migration.test.ts`
- Test: `tests/dgl/machine.test.ts`, `show.test.ts`, `routes.test.ts`, `auth.test.ts`, `admin-view.test.ts`, `setup-view.test.ts`, `kiosk-view.test.ts`, `audience-view.test.ts`, `stage-view.test.ts`

**Interfaces:**
- Produces (exact):
  - `type Role = "SUPER_ADMIN" | "HOST"`.
  - `LiveAction` is: `putOnStage { name: string }`, `renameAct { name: string }`, `spinWheel`, `startPerformance`, `startVoting`, `pauseVoting`, `resumeVoting`, `stopVoting`, `reopenVoting`, `setSelfScore { score: number }`, `reveal`, `complete`. Removed: `selectContestant`, `reassignContestant`, `setPrompt`, `drawPrompt`, and the setup action `upsertContestant`. `ContestantStatus` and `AdminState.contestants` are removed. `ActionResult` code `needs_prompt` is removed (also from the route's status map and the admin copy).
  - `PublicState` gains `spunAtMs: number | null` (server time of the last spin of the current act, else null).
  - `TRANSITIONS` (exact): IDLE `[putOnStage]`; COMPLETED `[putOnStage]`; READY `[renameAct, spinWheel, setSelfScore, startPerformance]`; PERFORMING and PERFORMED `[renameAct, setSelfScore, startVoting]`; VOTING `[pauseVoting, stopVoting, setSelfScore]`; VOTING_PAUSED `[resumeVoting, stopVoting, renameAct, setSelfScore]`; VOTING_CLOSED `[reopenVoting, setSelfScore, reveal]`; REVEAL `[complete]`. `nextStatus("putOnStage")` is `"READY"`; `renameAct`, `spinWheel`, `setSelfScore` give null.
  - `PERMISSIONS`: HOST has every live action plus `kioskVote`; SUPER_ADMIN has every live and setup action plus `kioskVote` (setup actions are `upsertPrompt`, `upsertAdmin`, `setFlaggedExcluded`, `resetShow`).
  - `DGL.limits.nameMax = 80`; `DGL.wheel = { spinMs: 4500, segments: 12 }`; copy (exact): `putOnStage: "Put on stage"`, `actNameLabel: "Who is on stage?"`, `actNameRequired: "Type a name first."`, `fixName: "Fix the name"`, `saveName: "Save name"`, `spinWheel: "Spin the wheel"`, `spinAgain: "Spin again"`, `spinning: "Spinning the wheel..."`, `noPromptsReason: "Add prompts in Setup first"`, `noPromptYet: "No prompt yet. You can start without one."`, plus role labels `Super admin` and `Host`.
  - `spinState(spunAtMs: number | null, serverNowMs: number, spinMs?: number): "none" | "spinning" | "landed"` in `wheel.ts` (`spinMs` defaults to `DGL.wheel.spinMs`; `"spinning"` while `serverNowMs < spunAtMs + spinMs`).
  - `useSpinning(spunAtMs: number | null, offset: number): boolean` in `use-spin.ts` (client hook; false on the server and on the first client render; computes from `Date.now() + offset` after mount and schedules one timeout to flip to false when the spin ends; cleans up).
  - `Act = { contestant: string | null; prompt: string | null; spinning: boolean }` in the audience view; while `spinning` the `prompt` is null and the screens show `DGL.copy.spinning` instead. `pollDelay` in `clock.ts` treats READY as live (fast cadence).
  - `normalizeRole(raw: string): Role` in `auth.ts`: `"SUPER_ADMIN"` stays, anything else is `"HOST"`; used wherever a role is read from the database.
- Schema: new idempotent steps after the existing ones, each with a catalog-only probe expression so `SCHEMA_PROBE` stays lock-free and covers them: `ALTER TABLE dgl_performances ADD COLUMN IF NOT EXISTS contestant_name text`; `... ADD COLUMN IF NOT EXISTS spun_at timestamptz`; `ALTER TABLE dgl_performances ALTER COLUMN contestant_id DROP NOT NULL` (probe via `pg_attribute.attnotnull`); last step `UPDATE dgl_admins SET role = 'HOST' WHERE role IN ('OPERATOR', 'VOLUNTEER')` (no probe: it rides on the same pass). Column probes use `to_regclass` plus `pg_attribute` (never reference a table that may not exist).
- Behaviour:
  - Act name: `putOnStage` and `renameAct` trim, require 1 to `nameMax` characters and no control characters (U+0000 to U+001F, U+007F), else `invalid`.
  - `putOnStage` inserts a READY performance (id made in the same UPDATE that bumps the version, as `selectContestant` did) with `contestant_name`, `contestant_id` null; reads use `contestant_name` and no longer join contestants.
  - `spinWheel`: `invalid` when no active prompt exists; else one statement picks a random active prompt, preferring one no performance has used, sets `prompt` and `spun_at = now`, bumps the version, audits (`detail.text`).
  - `startPerformance` no longer needs a prompt. `AdminState.me.role` is a `Role`. The VOLUNTEER stripping in `readAdminState` is removed.
  - Console: IDLE and COMPLETED show a name form (label above, Enter submits, error below) whose button is "Put on stage"; the phases that allow `renameAct` show a compact "Fix the name" control; READY shows "Spin the wheel" (label "Spin again" once `spunAtMs` is set), disabled with the reason when no active prompt exists, and the prompt read-only once the spin has landed or `noPromptYet`; the typed-prompt panel, "Draw prompt", the contestant queue, `queueAction` and the swap-sort helpers are deleted. Setup loses the Contestants section; Prompts and Admins are for SUPER_ADMIN only; the role select offers Super admin and Host. The kiosk allows both roles. The stage and the phone show `DGL.copy.spinning` in place of the prompt while `useSpinning` is true (full restyle comes in Tasks 6 and 7).

- [ ] **Step 1: Write the failing tests:**
  - `machine.test.ts`: the transition table cell by cell (every phase against every live action, derived from the exact table above); `HOST has kioskVote and no setup action`; `SUPER_ADMIN has every action`; `nextStatus` for the new actions.
  - `show.test.ts`: `putOnStage creates a READY act with the trimmed name` (and `contestant_id` null); `putOnStage refuses an empty, 81 character and control character name` (`invalid`, nothing written); `renameAct works in READY and paused voting and is not_allowed in VOTING`; `spinWheel sets the prompt and spun_at from now`; `spinWheel prefers an unused prompt` (two prompts, one already used by another act, always picks the other over 20 runs); `a second spin replaces the first`; `spinWheel is not_allowed outside READY`; `spinWheel is invalid with no active prompts`; `startPerformance works without a prompt`; `public state exposes spunAtMs`; `a legacy role reads as HOST` (a row inserted with role OPERATOR logs in and acts as HOST); the existing concurrency and audit tests keep passing with the new action names.
  - `migration.test.ts`: `migrates the shipped schema in place`: build a PGlite database from `fixtures/schema-v1.ts`, insert an admin of each of SUPER_ADMIN, OPERATOR, VOLUNTEER, a contestant, a performance with `contestant_id` and a vote, and point the single show row at it; run `ensureSchema`; assert the new columns exist, `contestant_id` is nullable, OPERATOR and VOLUNTEER are now HOST, SUPER_ADMIN is unchanged, the old rows are intact, a second `ensureSchema` on a new wrapper runs exactly one query (the probe), and `login` works for the migrated HOST.
  - `wheel.test.ts`: `spinState` for `null`, one ms before the end, exactly at the end, and after.
  - `admin-view.test.ts`: primary action per phase for HOST and SUPER_ADMIN (IDLE and COMPLETED need a name, READY starts the performance with no prompt reason, the rest as before); the spin control's label and disabled reason; no queue and no prompt controls anywhere; `settleKey` still changes only on real steps.
  - `setup-view.test.ts`, `kiosk-view.test.ts`, `audience-view.test.ts` (`Act.spinning` hides the prompt), `stage-view.test.ts`, `routes.test.ts` (status map without `needs_prompt`; action route accepts the new action types and rejects the removed ones with 400), `auth.test.ts` (roles).
- [ ] **Step 2:** Run `npm test`; the new tests FAIL.
- [ ] **Step 3:** Implement the types, machine, schema (steps and probe), show reads and writes, auth role normalisation, wheel and spin hook, copy, then the console, setup, kiosk, phone and stage changes. Update `scripts/dgl-admin.ts` to accept only the two roles.
- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; all pass.
- [ ] **Step 5:** Commit `feat(dgl): acts by name, spin the wheel, host and super admin only`.

---

### Task 3: Tracks, server side

**Files:**
- Modify: `src/data/dgl.ts`, `src/lib/dgl/types.ts`, `machine.ts`, `schema.ts`, `show.ts`, `votes.ts`, `auth.ts`, `route.ts`; `src/app/api/dgl/state/route.ts`, `me/route.ts`, `admin/state/route.ts`, `admin/action/route.ts`, `kiosk/vote/route.ts`; `scripts/dgl-admin.ts`
- Create: `src/lib/dgl/tracks.ts`, `tests/dgl/tracks.test.ts`
- Test: every server test file (`show`, `votes`, `routes`, `auth`, `machine`, `migration`, `db`), `tests/dgl/tracks.test.ts`

**Interfaces:**
- Produces (exact):
  - `src/data/dgl.ts`: `DGL_TRACKS = [{ id: "build", label: "Build" }, { id: "grow", label: "Grow" }, { id: "think", label: "Think" }] as const` and `type Track = (typeof DGL_TRACKS)[number]["id"]`.
  - `src/lib/dgl/tracks.ts`: `TRACK_IDS: readonly Track[]`, `isTrack(x: unknown): x is Track`, `trackLabel(t: Track): string`, `canAccessTrack(adminTrack: Track | null, track: Track): boolean` (true when `adminTrack` is null or equal), `defaultTrackFor(adminTrack: Track | null): Track` (`adminTrack ?? "build"`).
  - `type Admin = { id: string; name: string; role: Role; track: Track | null }` defined once in `types.ts` and used by `auth.ts` and `show.ts`; `login` and `currentAdmin` return it (the stored value must pass `isTrack`, else null track is not assumed: an unreadable value means no access, return null admin).
  - `PublicState` gains `track: Track`. `AdminState` gains `track: Track` and `me: { name; role; track: Track | null }`. `SetupAction.upsertAdmin` gains `track: Track | null`.
  - `readPublicState(db: Db, track: Track, now: number)`, `readAdminState(db: Db, admin: Admin, track: Track, now: number)`, `applyAction(db: Db, admin: Admin, track: Track, action: Action, version: number, now: number)`.
  - `CastVoteInput` gains `track: Track | null` (null: the public route, the performance id alone identifies the show; kiosk: the request's track, already checked against the admin). `myVote(db, voterId, track)`.
  - `parseTrack(x: unknown): Track | null` in `route.ts`.
- Schema (idempotent, probed): table `dgl_tracks(track text primary key check (track in ('build','grow','think')), current_performance_id uuid references dgl_performances, version int not null default 0, winner_shown boolean not null default false)` with the three rows seeded (`ON CONFLICT DO NOTHING`); `ALTER TABLE dgl_performances ADD COLUMN IF NOT EXISTS track text`; `ALTER TABLE dgl_admins ADD COLUMN IF NOT EXISTS track text`; `CREATE INDEX IF NOT EXISTS dgl_performances_track_idx ON dgl_performances (track, created_at)`. `dgl_show` and old rows are left in place and unused; performances with a null `track` are never read.
- Behaviour:
  - Every `id = 1` on `dgl_show` becomes `track = $track` on `dgl_tracks`: the version bump guard, the current-performance join in reads, `putOnStage` (the new performance row gets `track`), `resetShow` (deletes only that track's performances, nulls the pointer, clears `winner_shown`), `setFlaggedExcluded` (the performance must belong to the request's track), the moderation list and the vote-time current-performance join.
  - Access: `applyAction`, `readAdminState` and the kiosk route refuse an admin whose `track` is not null and differs from the requested track (`forbidden` / HTTP 403, nothing written). `upsertAdmin` is `forbidden` unless the actor is a SUPER_ADMIN with `track` null; it stores the target's `track` (null means all). Audit `detail` of every action records `track`.
  - Routes: `GET /api/dgl/state?track=` and `GET /api/dgl/me?track=` return 400 `{ error: "bad request" }` (no-store) for a missing or unknown track; `GET /api/dgl/admin/state?track=` defaults to `defaultTrackFor(admin.track)` when absent and is 403 for a track the admin cannot access; `POST /api/dgl/admin/action` and `POST /api/dgl/kiosk/vote` take `track` in the body (400 when missing or unknown, 403 when not accessible). The state route's cache headers are unchanged. `POST /api/dgl/vote` is unchanged.
  - `scripts/dgl-admin.ts` accepts `--track build|grow|think|all` (default `all`, stored as null) and keeps hidden-passcode input, upsert by name and the never-print-the-URL rules; `parseArgs` is exported and tested.

- [ ] **Step 1: Write the failing tests:**
  - `tracks.test.ts`: `isTrack`, `canAccessTrack` matrix (null admin track with each track, equal, different), `defaultTrackFor`.
  - `show.test.ts`: `two tracks run independently` (put an act on stage in build and in grow; each public state shows only its own act); `an action in one track never makes another track stale` (versions are independent); `resetShow clears only its own track`; `moderation lists only the track's acts`; `a track admin is forbidden in another track` (read and action; no audit row written); `an all-track admin can act in any track`; `upsertAdmin needs an all-track super admin and stores the track`; `audit detail records the track`.
  - `votes.test.ts`: `votes are counted per track` (same voter votes in both tracks' current acts); `a kiosk vote with a track the performance does not belong to is closed and writes nothing`; `myVote is per track`.
  - `routes.test.ts`: state and me with and without a valid track (400, then per-track results; cache headers unchanged); admin state default and explicit track and the 403; action and kiosk routes with missing, unknown and inaccessible tracks (and nothing written on 403); `a track admin cannot use the kiosk in another track`.
  - `migration.test.ts` (extend): after the v1 fixture is migrated the three `dgl_tracks` rows exist, legacy performances have a null track and appear in no track's state, moderation or acts, legacy `dgl_show` is ignored, and migrated admins have `track` null; `login` returns `track`.
  - `auth.test.ts`: `login` and `currentAdmin` return the stored track; an unreadable stored track yields no session.
  - `scripts`: `parseArgs` track flag (default all, each slug, rejects unknown).
- [ ] **Step 2:** Run `npm test`; the new tests FAIL.
- [ ] **Step 3:** Implement. Keep each write one statement. UI hooks and pages are not touched in this task (they are updated in Task 4, so the clients are expected to send no track until then; `npx tsc --noEmit` must still pass).
- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; all pass.
- [ ] **Step 5:** Commit `feat(dgl): tracks on the server, track admins, per-track shows`.

---

### Task 4: Tracks, pages and clients

**Files:**
- Modify: `src/lib/dgl/use-dgl-state.ts`, `use-vote.ts`, `client-http.ts`, `use-admin.ts`; `src/components/dgl/AudienceView.tsx`, `StageView.tsx`, `AdminConsole.tsx`, `KioskView.tsx`, `SetupPanel.tsx`, `SetupAdmins.tsx`; `src/app/dgl/page.tsx`, `src/app/dgl/admin/page.tsx`, `src/app/dgl/kiosk/page.tsx`, `src/app/dgl/stage/page.tsx`; `public/dgl-sw.js`; `tests/dgl/sw.test.ts`
- Create: `src/app/dgl/[track]/page.tsx`, `src/app/dgl/[track]/stage/page.tsx`, `src/components/dgl/TrackPicker.tsx`, `src/components/dgl/TrackSwitcher.tsx`; `tests/dgl/client-http.test.ts`

**Interfaces:**
- Produces (exact):
  - `useDglState(track: Track)`, `useVote(state, track: Track)`, `fetchMe(track: Track)` (the in-flight dedupe is per track), `useAdmin(track: Track | null)` (null asks the server for the default; the served `state.track` is the truth; a state whose track differs from the requested one is ignored).
  - Pure URL builders in `client-http.ts`: `stateUrl(track)` is `/api/dgl/state?track=<track>`, `meUrl(track)`, `adminStateUrl(track: Track | null)` (no query when null).
  - `useAdmin.act(action, expectedVersion?)` posts `{ track: state.track, action, version }`.
  - Routes: `/dgl` is a server page listing the three rooms as large links to `/dgl/{track}` (title `DGL.copy.pickRoomTitle` "Pick your room", body "Choose the track you are watching."); `/dgl/{track}` is the audience page; `/dgl/{track}/stage` is the projector, its QR code encodes `${EVENT.url}/dgl/${track}`; `/dgl/stage` is a stage picker (links to `/dgl/{track}/stage`); `[track]` pages use `generateStaticParams` returning the three tracks and `dynamicParams = false` so any other value is a 404; static `admin` and `kiosk` pages still win over `[track]`.
  - Admin console: when `me.track` is null a `TrackSwitcher` (three buttons, `aria-pressed`) chooses the track and remounts the console subtree with `key={track}` so no confirm, settle or in-flight state leaks across tracks; a track admin sees only a label with their track. The selected track is remembered in `sessionStorage` (try/catch, read in an effect). The kiosk page uses the same switcher and sends `track` in its vote body. Setup: the Admins section (and the account track select: All tracks, Build, Grow, Think) shows only for a SUPER_ADMIN with `me.track` null; moderation and "Reset show" act on the console's current track and say which track in their text.
  - Service worker cache name becomes `dgl-v2`; shell fallback stays `/dgl` (now the picker); header and kill-switch comments updated.
  - Phone and stage pages show the track label (`DGL.tracks` label) in their header (minimal; Tasks 6 and 7 restyle).

- [ ] **Step 1: Write the failing tests:** `client-http.test.ts`: `stateUrl`, `meUrl`, `adminStateUrl` for each track and null; `fetchMe("grow")` requests `/api/dgl/me?track=grow` (stub `fetch` with `vi.stubGlobal`) and two concurrent calls for different tracks do not share a request while two for the same track do; `sw.test.ts`: cache name `dgl-v2`, old `dgl-v1` is deleted on activate by the existing prefix rule.
- [ ] **Step 2:** Run `npm test`; the new tests FAIL.
- [ ] **Step 3:** Implement the hooks, pages, picker, switcher and the console, kiosk and setup changes. Read the Next 16 docs for dynamic routes before writing `[track]`.
- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; confirm the build output lists `/dgl`, `/dgl/stage`, `/dgl/admin`, `/dgl/kiosk` and the three `/dgl/{track}` and three `/dgl/{track}/stage` routes. Start `npm start -- -p 3120` with `DATABASE_URL= DGL_SECRET=` empty and `curl` `/dgl/build`, `/dgl/nope` (404), `/dgl` and `/dgl/stage`; kill the server.
- [ ] **Step 5:** Commit `feat(dgl): track pages, room picker and track-aware clients`.

---

### Task 5: Winner

**Files:**
- Modify: `src/lib/dgl/types.ts`, `machine.ts`, `show.ts`, `route.ts` (status), `admin-view.ts`, `audience-view.ts`, `stage-view.ts`; `src/app/api/dgl/admin/action/route.ts`; `src/data/dgl.ts`; `src/components/dgl/AdminConsole.tsx`, `AudienceView.tsx`, `StageView.tsx`
- Create: `src/lib/dgl/standings.ts`, `tests/dgl/standings.test.ts`
- Test: `tests/dgl/show.test.ts`, `machine.test.ts`, `routes.test.ts`, `admin-view.test.ts`, `audience-view.test.ts`, `stage-view.test.ts`

**Interfaces:**
- Produces (exact):
  - `standings.ts`: `type ActStanding = { performanceId: string; name: string; status: StoredStatus; votes: number; exact: number | null; revealed: boolean }`, `type Winners = { names: string[]; audience: number }`, `winnersOf(acts: ActStanding[]): Winners | null`: considers acts with `revealed` and `votes > 0`; the winners are those whose `exact` equals (`===`) the maximum; `audience = Math.round(max)`; `names` in running order; null when no act qualifies.
  - `LiveAction` gains `showWinner` and `hideWinner`; allowed only in COMPLETED (add to that phase's list; both roles); `ActionResult` code gains `no_winner` (HTTP 409, copy "No act has votes yet").
  - `PublicState` gains `winner: Winners | null`, non-null only while the host has the winner screen on (`dgl_tracks.winner_shown`); computed on read, so moderation changes show immediately.
  - `AdminState` gains `acts: { performanceId; name; status; votes; audience: number | null; exact: number | null; revealed: boolean }[]` (this track, running order), `leaders: Winners | null` (same function over the same acts) and `winnerShown: boolean`.
  - `showWinner` refuses with `no_winner` when `leaders` is null; `showWinner` and `hideWinner` set `winner_shown` and bump the version; `putOnStage` and `resetShow` set it false.
  - Copy (exact): `showWinner: "Show winner"`, `hideWinner: "Hide winner"`, `winnerTitle: "Winner"`, `winnersTitle: "Winners"`, `actsSoFar: "Acts so far"`, `noWinnerReason: "No act has votes yet"`, `leading: "Leading"`, `winnerScore: (n: number) => string` (`Audience 9 / 10`).
  - Console: an "Acts so far" list (name, `N / 10`, vote count, staff-only exact value in parentheses via `formatRaw`, a "Leading" marker on the leaders); in COMPLETED a "Show winner" button (disabled with `noWinnerReason`) or, while shown, "Hide winner". Stage and phone: minimal text screens for the winner (full design in Tasks 6 and 7).

- [ ] **Step 1: Write the failing tests:**
  - `standings.test.ts`: `highest exact average wins`; `an exact tie returns every tied act in running order`; `acts with no counted votes never win`; `unrevealed acts never win`; `audience is the rounded maximum` (8.5 gives 9); `null when nothing qualifies`.
  - `show.test.ts`: `showWinner then hideWinner` (state toggles, version bumps, audited); `showWinner is no_winner with no revealed act that has votes`; `showWinner is not_allowed outside COMPLETED`; `putOnStage clears the winner screen`; `resetShow clears it`; `excluding flagged votes changes the winner while shown`; `public winner is null unless shown`; `acts lists this track's acts with exact and rounded scores`; both roles may use the actions.
  - `admin-view.test.ts` (secondary actions in COMPLETED, disabled reason), `routes.test.ts` (`no_winner` is 409), `audience-view.test.ts` and `stage-view.test.ts` (a `winner` view kind when `winner` is set).
- [ ] **Step 2:** Run `npm test`; the new tests FAIL.
- [ ] **Step 3:** Implement the standings query (acts of the track with `count(*) FILTER (WHERE NOT excluded)` and `avg(score) FILTER (WHERE NOT excluded)`), the actions, the reads and the minimal UI.
- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; all pass.
- [ ] **Step 5:** Commit `feat(dgl): track winner, acts so far and show or hide winner`.

---

### Task 6: Stage redesign

**Files:**
- Modify: `src/lib/dgl/stage-view.ts`, `src/components/dgl/StageView.tsx`, `StageTimer.tsx`, `Reveal.tsx`, `src/app/dgl/[track]/stage/page.tsx`, `src/data/dgl.ts`, `package.json`
- Create: `scripts/render-dgl-banner.mts`, `public/brand/dgl/dgl-banner.webp`, `src/components/dgl/StageBanner.tsx`, `PromptWheel.tsx`, `Winner.tsx`, `Confetti.tsx`; `tests/dgl/wheel.test.ts` (extend)
- Test: `tests/dgl/stage-view.test.ts`, `tests/dgl/wheel.test.ts`

**Interfaces:**
- Produces (exact):
  - `stageView(state: PublicState | null, spinning: boolean): StageView` with kinds `idle`, `completed`, `winner { names; audience }`, `ready { id; act }`, `spinning { id; act }` (READY while `spinning`; the prompt is hidden), `clock`, `voting`, `closed`, `reveal`, as before; `bannerFor(v: StageView): "poster" | "strip"` (poster for `idle` and `completed` only); `showsQr(v: StageView): boolean` (true only for kinds `clock` and `voting`).
  - `wheelTarget(prompt: string | null, segments: number): { segment: number; turns: number }` in `wheel.ts`: `segment` is a stable hash (FNV-1a over the prompt, 0 for null) modulo `segments`, `turns` is 6.
  - `scripts/render-dgl-banner.mts` (run with `npm run dgl:banner`, same runner style as `scripts/render-spotlight.mts`) writes `public/brand/dgl/dgl-banner.webp`, 2400x300, from `public/brand/dgl/dgl-poster.webp`: the title crop (about x 100 to 1390, y 215 to 790 of the 1502x1047 poster) scaled to the strip height and centred over a background built from the poster's top curtain area stretched to full width, with the crop's edges feathered into it. Open the result with the Read tool and iterate until the whole title is legible, centred and the seams are invisible; report what you saw. Fallback if it cannot be made clean: a typographic strip (title in the display face, gold, on a curtain-coloured gradient), never a sliced poster.
- Layout (exact):
  - `idle`, `completed`: the poster fills the viewport (`cover`, `object-position: 50% 60%`; `contain` below the `lg` breakpoint), header with lockup, track label and connection pill on top, two lines of text on a dark bottom fade: idle title `DGL.copy.idleTitle` and body `DGL.copy.stageIdleBody` = "The QR code to vote appears when the act begins."; completed uses `DGL.copy.completed`. No QR.
  - Every other kind: the banner strip (full width, about 22vh) on top of the header, then the content. `ready`: "Up next", the name very large, centred in the remaining space. `spinning`: left column "Up next", the name, `DGL.copy.spinning`; right column the wheel. `clock`: left name and prompt; right the big seconds number with its "sec" label and, beneath, the QR (about 28vh) with "Scan to vote" and the URL. `voting`: QR large (about 40vh) with "Vote now", the count and the URL (paused: the existing paused line). `closed` and `reveal`: no QR. `winner`: centred "Winner" or "Winners", the name(s) very large, `winnerScore(n)`, with confetti.
  - Wheel: a circle painted with a 12-colour `conic-gradient` from `PAL`/`SPECTRUM` mids, a fixed pointer at the top (a CSS shape), a dark hub; `m.div` rotates from 0 to `turns * 360 + (360 - (segment * 30 + 15))` degrees with the remaining spin time as the duration (at least 0.8 s) and an ease-out curve; under reduced motion the transition is `{ duration: 0 }` with the same target. When the spin ends the prompt appears under the name.
  - Confetti: `canvas-confetti`, dynamically imported inside an effect on the winner screen only (never on phones), a few gold and spectrum bursts over about 6 s, `zIndex` from `Z.overlay`, never under reduced motion, cleaned up on unmount (`confetti.reset()`).
  - The poster and strip use `next/image` with explicit dimensions and `priority`; alt text comes from `DGL.copy` (poster alt exists; add a banner alt).
- [ ] **Step 1: Write the failing tests:** `stage-view.test.ts`: `bannerFor` is poster for idle and completed and strip for every other kind; `showsQr` is true for exactly `clock` and `voting` (including paused voting and PERFORMED) and false for idle, completed, ready, spinning, closed, reveal and winner; `ready becomes spinning only while spinning is true and hides the prompt`; `winner view carries names and audience`. `wheel.test.ts`: `wheelTarget` is deterministic, in range, 0 for null, and differs for different prompts.
- [ ] **Step 2:** Run `npm test`; the new tests FAIL.
- [ ] **Step 3:** `npm i canvas-confetti` and `npm i -D @types/canvas-confetti`; add the `dgl:banner` script; generate and inspect the banner; implement the views and components; keep the timer, reveal count-up and cursor-idle behaviour from before.
- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; in the built stage HTML confirm no QR markup for idle, and grep that `canvas-confetti` is imported only from a client component and only via dynamic import.
- [ ] **Step 5:** Commit `feat(dgl): stage banner, wheel, winner screen and QR only once the act starts`.

---

### Task 7: Phone redesign

**Files:**
- Modify: `src/lib/dgl/audience-view.ts`, `src/components/dgl/AudienceView.tsx`, `ScoreGrid.tsx`, `ConnectionPill.tsx` (only if needed), `ActClock.tsx`, `src/app/dgl/[track]/page.tsx`, `src/data/dgl.ts`
- Create: `src/components/dgl/PhoneHeader.tsx`, `ActCard.tsx`
- Test: `tests/dgl/audience-view.test.ts`

**Interfaces:**
- Produces (exact): audience view kinds gain `winner { names; audience }` and `spinning` handled inside `act` as in Task 2; `viewFor` returns the same kinds otherwise. Copy additions in `DGL.copy`: `audienceSoFar: "Audience so far"`, `yourScoreRecorded` is not needed (reuse `voteRecorded`); wording for the winner card reuses Task 5 copy.
- Design (exact): variance 3, motion 4, density 3. `PhoneHeader`: "DevFest Got Latent" in display type with the `yellow-hi` token, the track chip (`DGL.tracks` label, `glass-pill`), the connection pill; it replaces the small lockup and grey title (the lockup may stay as a tiny mark only if it fits on one line at 360 px). One accent: the `yellow` tokens for the picked tile and the main button (`bg-yellow text-[#0a0a0c]`); green, red and grey only for vote status, always with words and an icon; blue is not used. `ActCard`: name, prompt and the clock in one card (`.glass`, radius 20). Score tiles 64 px tall, the picked one filled `yellow` with dark text and scale 1.04, plus `navigator.vibrate?.(10)` called from the tap handler only (feature-detected, never in render). "Lock in N" is pinned to the bottom of the viewport (sticky footer inside the min-h-[100dvh] column, safe-area padding, `Pick a score` disabled before a pick), so it cannot fall below the fold at 360x640. After "Vote recorded": a large score card (88 px mono) with the check icon and the status line, and below it `Audience so far` with the whole-number live average (`outOfTen`) and the vote count, following the existing `showLiveAverage` rule. Reveal: own score and audience side by side in large mono, the verdict beneath. Winner: a gold-bordered card with "Winner" or "Winners", the name(s) and `winnerScore(n)`; no confetti, no banner image. Waiting, between-acts and "Spinning the wheel..." screens are clear single messages; the spinning screen may show a slowly rotating icon only through a CSS class that the `prefers-reduced-motion` block in `globals.css` switches off (static icon then), never through a JS branch on `useReducedMotion()`. Keep: the keyboard model of `ScoreGrid`, the live region, hydration safety, `[@media(max-height:700px)]` tightening so the grid and the button fit at 360x640 (re-derive the worst-case height at 360x640 with a two-line name, a three-line prompt and the not-counted line, and state the number).
- [ ] **Step 1: Write the failing tests:** `audience-view.test.ts`: `winner kind when state.winner is set` (names and audience carried; wins over other phases only when set); `liveText` for the winner kind; the existing view tests keep passing.
- [ ] **Step 2:** Run `npm test`; the new tests FAIL.
- [ ] **Step 3:** Implement the components and the `ScoreGrid` restyle (it is shared with the admin own-score entry and the kiosk: keep its props, roles and keyboard behaviour identical).
- [ ] **Step 4:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; grep that nothing under `src/components/dgl` or `src/app/dgl` uses `motion.`, `Button` or `Lockup` outside comments; contrast-check the gold button text and the status colours against their backgrounds and say the ratios.
- [ ] **Step 5:** Commit `feat(dgl): refined phone voting screen`.

---

### Task 8: Documentation, runbook and final checks

**Files:**
- Modify: `docs/dgl-runbook.md`, `docs/SPEC.md` (new section 39), `CLAUDE.md` (DGL rules), `scripts/dgl-load-check.mjs` (track-aware), `docs/superpowers/specs/2026-10-09-dgl-tracks.md` (only to record rulings made during the build)

- [ ] **Step 1:** Update the runbook for event day: the three rooms and their URLs; the two roles and the track admins; the exact admin creation commands (`npm run dgl:admin -- --name "Build Admin" --role SUPER_ADMIN --track build`, then Grow and Think; passcodes are the organisers'; the first run also migrates the database; run them after the deploy); put on stage, fix the name, spin the wheel, start, vote, stop, own score, reveal, next, show winner; the QR rule; the winner screen; kiosk accounts; the new failure drills; the rollout order (deploy, create admins, sign in on each device, rehearse). Keep the existing honest "not verified in any browser" list and extend it with every new screen.
- [ ] **Step 2:** `CLAUDE.md`: replace the DGL bullets that are now wrong (roles, contestants, tracks, QR rule, whole-number scores, seconds timer, `[track]` routes, `dgl_tracks`) keeping the file's density. `docs/SPEC.md` section 39 in the voice of sections 36 to 38: what changed, why, the measured numbers (first-visit transfer if it can be measured as before, labelled), verified and not verified lists.
- [ ] **Step 3:** `scripts/dgl-load-check.mjs`: add a required `--track`, read `/api/dgl/state?track=` and keep every safety gate (production-host refusal, https, `--confirm`, VOTING only); `node --check` it and run it with no arguments (usage, exit 1).
- [ ] **Step 4:** Run the whole verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, the dash grep over lines added on the branch, the `motion.` and `Button`/`Lockup` grep under `src/components/dgl` and `src/app/dgl`, and a grep that no client file imports `qrcode`.
- [ ] **Step 5:** Commit `docs(dgl): runbook, SPEC section 39 and CLAUDE rules for tracks`.
