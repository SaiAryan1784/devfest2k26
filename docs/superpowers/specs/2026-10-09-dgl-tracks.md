# DGL event-day changes: tracks, acts by name, wheel, winner

Written 9 Oct 2026 for the event on 10 Oct. Builds on the DGL feature already on `main` (see `docs/SPEC.md` section 38 and `docs/dgl-runbook.md`). The owner approved this design in conversation and asked for execution without further review stops.

## What the owner asked for (their words, then the answers they gave)

1. Three tracks run at the same time, so create three super admins: Build Admin, Grow Admin, Think Admin. **Answer:** a separate show per track. Each track has its own stage screen, QR code, voting page and show state, and votes never mix. Build Admin runs only Build; the two existing super admins can run any track.
2. Remove the contestant lineup; anyone can be entered and goes straight on screen. **Answer:** the host types the name and taps "Put on stage".
3. Only three roles: Host (runs the show), Super admin (controls everything), and the user (the audience, who has no account). Audience members are not an admin role.
4. Remove the minimum number of votes guard rail.
5. A winning screen with confetti. **Answer:** a track winner at the end: after the last act the host taps "Show winner"; the stage shows the act with the highest audience score in that track, with confetti. Only an exact tie shows two names.
6. Remove the prompt input. Give the host a spin-the-wheel option for a random prompt when an attendee has not prepared anything.
7. The DevFest Got Latent banner should be full width and placed better. **Answer:** on the stage while waiting, between acts and during each act. The phone voting page does not get the banner.
8. Show the time as 90 secs, not 1.5 mins (the clock now reads `1:30`).
9. The audience average is rounded: floor below .5, ceil at .5 and above.
10. The QR code must not be visible before the act has started; only once the act has started.
11. The phone voting screen can be more refined.

## Decisions

### Tracks
- Slugs are exactly `build`, `grow`, `think`; labels Build, Grow, Think.
- URLs: `/dgl` picks a room; `/dgl/{track}` is the audience page; `/dgl/{track}/stage` is the projector; `/dgl/stage` is a stage picker (the old stage address keeps working as a picker); `/dgl/admin` and `/dgl/kiosk` choose the track inside the page (an all-track admin gets a switcher, a track admin is fixed to theirs).
- Each track has its own current act, its own show version (so two tracks never make each other's buttons stale), its own winner screen state and its own acts. The prompt pool, the admin accounts and the audit log are shared.
- Every API that is about a show takes the track: `GET /api/dgl/state?track=`, `GET /api/dgl/me?track=`, `GET /api/dgl/admin/state?track=` (optional: defaults to the admin's own track, else `build`), `POST /api/dgl/admin/action` with `{ track, action, version }`, `POST /api/dgl/kiosk/vote` with `track` added. `POST /api/dgl/vote` is unchanged: the performance id identifies the track.
- Data from before this change (performances, votes, the single show row) stays in the database but belongs to no track and is never shown.

### Roles
- Admin roles are exactly `SUPER_ADMIN` and `HOST`. The audience is not a role.
- An admin has `track`: one of the three slugs, or null meaning all tracks. A track admin can only read and act in that track (403 elsewhere).
- HOST: every live action and kiosk voting. SUPER_ADMIN: everything a host can, plus setup (prompt pool, moderation, reset of a track) and, only when the super admin is an all-track one, admin accounts.
- Existing OPERATOR and VOLUNTEER accounts become HOST with all tracks (migration), and any other role value reads as HOST.
- Kiosk: any signed-in admin may record kiosk votes in the tracks they can access. A volunteer using a Host account could also run that track's show; the runbook says to give kiosk devices their own account.

### Acts and the wheel
- No lineup, no contestants table in use. `putOnStage { name }` creates the track's next act (allowed when the track is idle or between acts). `renameAct { name }` fixes a typo (READY, PERFORMING, PERFORMED, voting paused). An act name is 1 to 80 characters, trimmed, no control characters.
- The prompt is optional. There is no prompt input. `spinWheel` (READY only, repeatable) picks a random active prompt from the shared pool, preferring one no act in this track has used, and stores it with the server time of the spin. With no active prompts it is refused.
- Clients hide the prompt until the spin ends (`spun_at + 4500 ms`, server time). The stage shows a wheel of 12 coloured segments spinning for that time; phones show "Spinning the wheel...". Under reduced motion there is no spin and the prompt appears at once.

### Scores and the timer
- The audience score is a whole number: the exact average rounded half up (8.4 gives 8, 8.5 gives 9). The "Difference" is the whole-number gap, and "Perfect match" means the two numbers are equal. Staff still see the exact average to two decimals in the admin console.
- No minimum number of votes: the score exists from the first vote. With no votes there is no audience score: phones say "Waiting for audience..." while voting is open, the reveal says "No votes".
- The clock reads in whole seconds with a unit: `90` and `sec` (never `1:30`). It rounds up so it never reads 0 before time is up; at 0 it reads "Time". The last 10 seconds are yellow and the last 3 red, as before.

### Winner
- When no act is running (the track is between acts), the host can tap "Show winner". The winner is the revealed act in that track with the highest exact average among acts that have at least one counted vote; acts with no counted votes never win; excluded votes do not count; an exact tie shows every tied act. The screen shows "Winner" (or "Winners"), the name(s) and "Audience N / 10" with confetti on the stage; phones show a winner card.
- "Hide winner" or putting the next act on stage clears it. The staff console lists every act so far with its score and the current leader; there is no public leaderboard.

### Stage layouts
- The QR code (and the URL under it) shows only while the act is running or voting is open: PERFORMING, PERFORMED, VOTING, VOTING_PAUSED. It is hidden when waiting, up next, spinning the wheel, voting closed, at the reveal, between acts and on the winner screen.
- Waiting and between acts: the full poster (`public/brand/dgl/dgl-poster.webp`, 1502x1047) fills the screen (cover, positioned so the whole title shows and the floor is left for text), with two lines of text on a dark fade at the bottom. No QR.
- Up next, wheel spinning, act running, voting, closed, reveal, winner: a slim full-width curtain strip with the title (`public/brand/dgl/dgl-banner.webp`, 2400x300, made from the poster by a script) above the content, so the name, timer and QR stay large. A poster band was rejected for these screens: the title is about 51% of the poster's height, so it cannot show whole in a band short enough to leave room for the content.
- If the generated strip looks wrong when viewed, the fallback is a typographic strip (the title in the display face, gold, on a curtain-coloured gradient), never a cropped slice of the poster.

### Phone screen
- Dials: variance 3, motion 4, density 3. The header carries "DevFest Got Latent" in the DGL gold, a track chip and the connection pill. One accent: gold (the site's yellow tokens) for the picked score and the main button; green, red and grey only for vote status, always with words and an icon.
- The act (name, prompt, clock) sits in one card. Score tiles are 64 px tall; the picked one fills gold with dark text and grows slightly, with a short vibration on phones that support it. "Lock in N" is pinned to the bottom of the screen. After "Vote recorded" the score settles in a large card with the live whole-number "Audience so far" and the vote count. The reveal shows own score and audience side by side; the winner is a gold card. No confetti and no banner on phones.
- Unchanged: one vote per phone, the honest queued, recorded and not-counted states, keyboard access, AA contrast.

### Rollout
- The schema change is additive and idempotent (new table and columns, one nullable change, one role update). It runs on the first request after deploy or when `npm run dgl:admin` runs. `dgl:admin` gains `--track build|grow|think|all` (default all).
- After deploy the owner creates the track admins (passcodes are theirs): `npm run dgl:admin -- --name "Build Admin" --role SUPER_ADMIN --track build`, then Grow and Think.
- The service worker cache is renamed so phones that visited before pick up the new pages.

## Rulings made while writing this spec (owner can undo)

- Kiosk voting is open to Host and Super admin accounts (the volunteer role is gone). Cost if wrong: a kiosk device signed in as Host can also run its track's show; use a separate account per device.
- The winner uses the exact average, not the rounded one, so two acts that both show 8 / 10 can still have a single winner. Cost if wrong: ties would be more common and show two names.
- Prompts are one shared pool; "unused" is judged within a track. Cost if wrong: two tracks can draw the same prompt.
- The confetti library is `canvas-confetti` (about 10 KB, loaded only on the stage winner screen). Cost if wrong: remove the dependency and write a small canvas effect.
- Setup actions on the shared pool and accounts follow the role rules above; a track super admin cannot manage accounts. Cost if wrong: loosen one check.
