# DevFest Got Latent: organiser runbook

Live audience voting for DevFest Noida on 10 Oct 2026 (rehearsal on 8 Oct). Pages: `/dgl` (phones), `/dgl/stage` (projector), `/dgl/admin` (show control), `/dgl/kiosk` (volunteer backup voting).

Read the last section first. Nothing on these screens was ever seen in a browser during the build, so the rehearsal on 8 Oct is the first time anyone looks at them.

## Before doors

1. Developer: in Vercel set `DGL_SECRET` (make one with `openssl rand -hex 32`) and `DATABASE_URL`. Redeploy after setting them. Without either, every `/api/dgl` call answers 503 and the pages show "Offline" or "Cannot reach the server".
2. Developer: check that the Neon region and the Vercel function region are close. A far apart pair adds a round trip to every vote.
3. Developer: create the first admins with `npm run dgl:admin -- --name "<name>" --role SUPER_ADMIN`. The script writes to the database named by `DATABASE_URL` in your local `.env`. Confirm it is the same Neon database Vercel uses before relying on it, otherwise nobody can sign in on the night. Running it again with an existing name resets that admin's passcode and role and reactivates the account. That is the recovery path for a forgotten passcode, or for an admin locked out once the 15 minute lockout window has passed. The script asks for the passcode with hidden input. Run it again for each person with `--role OPERATOR`, `HOST` or `VOLUNTEER` for the others. Make ONE volunteer account PER kiosk device, because the kiosk rate limit is per admin id and two devices on one account slow each other down. Passcodes need at least 6 characters.
   Vercel shares environment variables across environments by default. If previews use the production database, the load check's votes and Reset show act on the production show. Give previews a separate Neon branch or database, or run the load check only before any real data exists.
4. Organiser: sign in at `/dgl/admin` as a super admin and open Setup. Add the contestants in running order (lowest sort number first). Add the prompts. "Load the starter prompts" adds a draft list from the code: replace it with the real prompts.
5. Organiser: reset rehearsal data: Setup, Reset show, type `RESET`. It clears every performance and vote and keeps contestants, prompts and admins. Never use it once the real show has started.
6. Organiser: open `/dgl/stage` full screen (F11) on the projector laptop. Leave the mouse alone: the pointer hides after 3 s.
7. Organiser: the stage shows the QR for `https://devfest2k26.gdgnoida.com/dgl`. The address comes from `EVENT.url` and is drawn at build time, so even a preview deployment's stage points phones at the production address. For a rehearsal on a preview, open the preview's `/dgl` by hand on the phones.
8. Organiser: put two volunteer phones on mobile data (not the venue Wi-Fi) and sign them in at `/dgl/kiosk`.
9. Organiser: ask the venue for a dedicated SSID for the audience and the admin devices. Hundreds of phones on a shared guest network is the biggest risk on the night.
10. Developer: on the preview, run `curl -sI https://<preview>/api/dgl/state` twice within a second. The second response must show `x-vercel-cache: HIT`. The one second CDN cache is what the design relies on: without it every phone polling reaches the database. If Vercel Deployment Protection is on, the preview answers 401 to curl and to the load script: turn protection off for that preview, or use Vercel's protection bypass token as its documentation describes.

## Roles

| Role | Can do |
|---|---|
| SUPER_ADMIN | Everything: the show buttons, Setup (contestants, prompts, admins, Exclude flagged votes, Reset show), the audit log, and kiosk votes. |
| OPERATOR | The show buttons, contestants and prompts in Setup, and kiosk votes. No admins, moderation, audit or reset. |
| HOST | The show buttons only. |
| VOLUNTEER | Kiosk votes only. The console says show controls are for hosts and operators. |

Nobody can edit a vote's score. A super admin cannot change their own role or deactivate themselves, and the last active super admin is locked.

## Per act

Press these in order. The big button always shows the next step.

1. Select a contestant (the big button jumps to the list, or press Select on a row). Phones and stage show "Up next", the name and the prompt.
2. Set the prompt: Draw prompt (picks an unused active prompt) or type one from the spinwheel (200 characters) and press Set prompt. Start performance stays grey until a prompt exists.
3. Start performance. The 90 s timer runs on the server. The last 10 s turn yellow and the last 3 s turn red. At zero the stage says "Time" and phones say "Time. Voting opens in a moment."
4. Start voting. You can press it at any point after Start performance, during the timer or after it ends. The stage shows the QR, "Vote now" and the live count. Phones show the score grid and "Lock in N".
5. Stop voting. It asks for a second tap within 3 s. Phones and stage show "Voting closed".
6. Own score: pick the contestant's own prediction (1 to 10) and press Save. It can be saved any time from Ready to Voting closed and stays hidden until the reveal. Reveal stays grey until it is saved.
7. Reveal. The stage shows the contestant's score, then the audience average counting up, then "Perfect match" or "Difference x.x". With fewer than 5 votes it says "Not enough votes for an audience score".
8. Next contestant. Phones show "Next act coming up". Then select the next contestant.

What the audience sees on a phone: before the first act "DevFest Got Latent starts soon"; Ready shows the name and prompt; Performing shows "On stage now" and the time left; Voting shows the grid, and once they have voted their score and the live average; Paused shows "Voting is paused"; Closed shows the final average; Reveal shows both scores.

## Failure drills

- The admin laptop dies. Open `/dgl/admin` on a phone and sign in. The show state lives on the server, so the console comes back exactly where it was. Sessions last 12 hours.
- Wrong contestant selected. Pause voting, use Reassign to pick the right one, then Resume voting. Votes already cast stay with the act and only the name changes. Reassign is offered in Ready, Performing, Time up and Paused, not while voting is open.
- The network drops on a phone. The vote is kept on the phone and the page says "Vote queued, waiting for connection". It sends when the connection returns and then says "Vote recorded". Tell the room to keep the page open and not to refresh.
- A kiosk press shows "Not sent". Pressing again is safe: each press carries an id, so a repeat cannot count twice. Do not reload that kiosk page between a lost answer and the next press, and check the Kiosk count in the admin bar. If you reload in that gap and the first press had actually arrived, a second press counts again.
- A double tap on the big button. The button ignores taps for 800 ms after the phase changes and the console shows "Updating". If two admins press at once, the second sees "Someone else just changed the show. Updated."
- The host paused by mistake. Press Resume voting.
- Voting stopped by mistake. In Voting closed press Reopen voting (two taps). A phone whose vote was refused as closed can vote again after the reopen.
- A phone says "Voting closed before your vote arrived, so it was not counted". The vote reached the server after Stop. Reopen voting if the room should still be able to vote.

## Moderation

A vote is flagged when it is the 26th or later vote from one IP address inside a rolling 10 s window. On shared venue Wi-Fi hundreds of phones share one public address, so in a busy room MOST votes will be flagged. That is expected and does not mean abuse. Flagged votes still count.

Exclude flagged votes (Setup, Moderation, super admin only) removes real votes from the count and the average. Use it only when you have evidence of real abuse, for example one person voting many times with many cookies. Never use it because the flagged number looks large. Include flagged votes puts them back.

To judge abuse, look at the vote count against the room size (a count well above the number of people present), and at a sudden jump of votes in a second or two that the room cannot explain. The flagged number alone tells you nothing on shared Wi-Fi.

## Known limits and decisions

- A passcode reset does not end an existing admin session. Sessions are signed tokens with only the admin id. Deactivating an admin does sign them out on their next request.
- After five sign in attempts for one name inside 15 minutes, a sixth is refused until the window passes. Someone who knows an admin name could lock it out on purpose. Existing sessions keep working.
- The average is hidden until 5 votes.
- The public state can be up to 2 s old (the CDN caches it for 1 s). The timer is computed from the server's `endsAtMs` plus a measured clock offset, so phones and the stage agree within about a second.
- One vote per browser per act, tied to a cookie. Clearing cookies allows a second vote, which is why one-address bursts are flagged. Rate limits live in each server instance's memory and are a speed bump, not a global limit.
- A vote that arrives without the voter cookie is never counted: the server sets the cookie and asks the phone to send it again, which it does within a second. A browser with cookies fully disabled therefore cannot vote. After three tries the phone says "Your browser is blocking cookies, so this vote cannot be sent. Allow cookies for this site and reload." and the vote stays queued. Such a voter can use the kiosk.
- Setup actions never change the show version, so editing a prompt mid-act does not make the host's next tap stale.
- A kiosk vote and its audit row are written in one statement. Either both exist or neither.
- On phones the audience average appears only after the person has voted, so early votes do not anchor later ones (`DGL.showLiveAverage` is "after-vote"; set it to "always" in `src/data/dgl.ts` for the original reading). The stage shows the average only at the reveal.
- The first visit to a page must be online. The offline shell only works after the page has loaded once with the service worker active. The shell for `/dgl/stage`, `/dgl/kiosk` and `/dgl/admin` is only there if you opened that page online first.
- The service worker never touches `/api`, so votes and polls are never answered from a cache.

## Service worker kill switch

If the offline shell misbehaves in production:

1. Replace `public/dgl-sw.js` with a file whose `activate` handler unregisters the worker and deletes every cache whose name starts with `dgl-`. Keep `skipWaiting` in the `install` handler so it takes over at once. Do not add a `fetch` handler.
2. In the same release delete `<RegisterSw />` from `src/app/dgl/layout.tsx`, so nothing registers it again.
3. Deploy. Browsers fetch the worker script on navigation (at the latest every 24 h) and install the replacement.
4. On a single device: DevTools, Application, Service Workers, Unregister, then Cache Storage, delete `dgl-v1`.

## Rehearsal checklist for 8 Oct

Organiser (with the developer): use real phones, the projector laptop and, if possible, the venue network. Run three acts end to end, including one wrong contestant fix and one admin handover. Then Reset show.

Not verified in any browser: every screen. The layout at 360 and 390 px wide, the 360 x 640 fit of "Lock in" (about 4 px of slack, worked out not measured), the stage at the projector's resolution (the column widths are derived), focus order and keyboard use, screen reader announcements, contrast, reduced motion, hydration warnings in the console, the service worker and offline behaviour, and the timing numbers on a slow connection. Interactive within 5 s on Slow 4G was not measured. Transfer size is about 395 KB with gzip and about 361 KB with brotli for `/dgl`, a little over the 350 KB plan ceiling (SPEC section 38). Watch the console and report anything odd.

### Phone (`/dgl`)

- Open `/dgl` at 390 x 844 and at 360 x 640. The whole grid and "Lock in" are visible without scrolling, every cell is at least 56 px tall, and a long contestant name or prompt does not push "Lock in" below the fold.
- Before the first poll the page shows the idle screen. Note whether "Live" shows too early.
- Walk every phase: idle, ready, performing, time up, voting, paused, closed, reveal, completed.
- Vote, then refresh: the score stays locked. Open a second tab: it shows the same locked score within a poll.
- Before voting no average is shown. After voting the average shows once there are 5 votes.
- Clear cookies and local storage, then vote again: it is accepted as a new voter.
- Keyboard: Tab into the grid, arrow keys choose, Enter on "Lock in". Focus lands on the locked score. VoiceOver and TalkBack announce phase and vote state without chatter every poll.
- Turn on reduce motion: no transitions and the same end states.
- Scan the share link on iPhone and Android: the preview card shows the DevFest title and image.

### Stage (`/dgl/stage`)

- Full screen at the projector's real resolution. The pointer hides after 3 s and returns on movement.
- From the back row, check that the name, prompt, "Scan to vote" and the timer digits are readable. Scan the QR with an iPhone camera and an Android camera or Lens. Both open `/dgl`.
- Ready shows "Up next", the name and the prompt. The timer counts from 1:30, yellow at 0:10, red at 0:03, "Time" at the end, and phones agree within about 1.5 s.
- Voting shows "Vote now" and the count, with no average. Pause shows "Voting is paused" in yellow. Closed shows the final count.
- Reveal with fewer than 5 votes: the contestant's score and "Not enough votes for an audience score", no audience number, and the name stays whole.
- Reveal with 5 or more: the contestant's score lands first, the audience number counts up for about 1.2 s and matches the phones, then the verdict fades in. Wait through several polls: it must not replay.
- Check the left column at 1280 wide during Performing. Reload during a reveal: it replays once from the start, which is expected.
- Reduce motion on, reload during a reveal: final numbers and verdict appear at once.
- Disconnect the network for 10 s: the corner pill says Reconnecting or Offline, the last state stays, and it recovers to Live.

### Admin (`/dgl/admin`)

- Wrong passcode says "Name or passcode is not right." and empties the field. Six wrong tries say "Too many attempts. Try again in 15 minutes."
- Sign in as OPERATOR on the laptop and HOST on a phone. Check the name, role and "Live" pill on both.
- Idle: "Select a contestant". Ready: "Start performance" is grey with "Add a prompt first". Draw a prompt, type one and set it (an empty one says "Type a prompt first.").
- Start performance: the timer matches the stage. Press "Start voting" on both devices at the same moment: one moves on and the other says "Someone else just changed the show. Updated." The audit log holds one startVoting.
- Voting: no Reassign panel. Pause shows it. Resume. The count and raw average update within a second from two phones.
- Stop voting: the first tap asks to confirm, 3 s later it reverts, two quick taps close voting. Try Reopen voting the same way.
- Closed with no own score: Reveal is grey with "Enter their own score first". Pick, "Save 8", then Reveal. Then "Next contestant" moves focus to the list and the act shows under Done.
- Reload the laptop mid-vote: the same state returns. Finish an act on the phone alone.
- Phone Wi-Fi off: the pill says Offline or Reconnecting and the last state stays. Back on, it recovers.
- Setup as SUPER_ADMIN: add two contestants, rename, reorder (check the order in Live), deactivate and reactivate. Add, edit and deactivate prompts. "Load the starter prompts" shows progress and ends with "All starter prompts are in the list."
- As an OPERATOR edit a prompt mid-vote, then as the host press Stop voting. It must not say "Someone else just changed the show."
- Admins: add a HOST (6 or more characters), sign in as them elsewhere, change the role (applies on their next request), reset the passcode (the old one fails), deactivate them (they are signed out). Your own row and the last super admin are locked. Two super admins demoting each other at the same moment: exactly one change goes through and at least one super admin remains.
- Moderation: with flagged votes on an act, Exclude flagged votes lowers Counted and the raw average, and Include restores them.
- Audit log: every change above appears, newest first, in IST, with no passcode or hash anywhere (check the network tab too).
- Reset show stays disabled until `RESET` is typed exactly, clears performances and votes, keeps the rest.
- Phone at 360 px: nothing scrolls sideways, buttons are easy to tap, and the fixed bottom bar leaves the last control reachable. Keyboard only on the laptop: every control reachable with a visible focus ring.
- Sign out on both devices and the form returns.

### Kiosk (`/dgl/kiosk`)

- Sign in as a VOLUNTEER. Not in voting: "Voting is not open." Start voting: the grid appears within a poll or two.
- Pick 7: "Record vote 7". Press: "Recorded. Hand over for the next vote." and the grid is locked about 2 s. The admin Kiosk count goes up by one and the audit log shows one kioskVote with no score.
- Press twice fast: only one vote. A new vote inside 2 s says "Too fast. Wait a moment." and keeps the pick.
- Pause: "Voting is paused" and no grid. Stop: "Voting closed".
- Airplane mode, press Record: "Not sent. Check this device's connection, then press again. It will not count twice." and the pick stays. Check the admin Kiosk count before pressing again.
- Sign in as HOST on the kiosk: only a role message and Sign out.
- Server down or `DATABASE_URL` unset on a preview: "Cannot reach the server" with Try again, never the sign in form.
- At 360 x 640 the header, grid and Record button fit or scroll without clipping.

### Offline

- On a production build over HTTPS, open `/dgl` in Chrome. Application, Service Workers shows `/dgl-sw.js` running with scope `/dgl`. Cache Storage has `dgl-v1`.
- Reload once online. `dgl-v1` has `/dgl` and `/_next/static/` entries and no `/api/` entries.
- Tick Offline and reload: the page renders from the cache and the pill says Offline. Cast a vote: "Vote queued, waiting for connection". Go online: "Vote recorded" within 4 s.
- Offline vote, then Stop voting, then online: the phone shows "Voting closed before your vote arrived, so it was not counted".
- Throttle to Slow 3G with 4 s or more of latency and reload: the cached page shows after about 4 s.
- Open `/`: it is not controlled by the DGL worker.
- Repeat the offline reload once on `/dgl/kiosk` and `/dgl/stage` after visiting them online.
- Check Unregister and deleting `dgl-v1` work.

### Load check (300 voters)

Developer: run this against a PREVIEW deployment, never production, with the show already in Voting. The script refuses the production host (`devfest2k26.gdgnoida.com`, with or without `www.`) before it makes any request, and also refuses non https addresses other than localhost. It needs a separate preview database or a database with no real data (see Before doors).

1. Organiser: in the admin console select a contestant, start the performance and start voting.
2. Run `node scripts/dgl-load-check.mjs --base https://<preview-url> --voters 300 --confirm`.
3. Expect about 300 recorded (200), no 429 and no 503, p95 under 1.5 s, and the vote count after equal to before plus the recorded count.
4. The admin console will show the votes as flagged, because they all come from one address. That is expected. 429 answers are not expected, since each fake voter votes once.
5. Stop voting and Reset show.

The script only casts votes. It does not log in or change the show, and it prints no cookies or secrets.
