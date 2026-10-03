#!/usr/bin/env node
// DGL load check. Run it by hand against a PREVIEW deployment, never production, during a
// rehearsal. Plain Node 22 ESM, no dependencies. It only casts votes: it never logs in and
// never changes the show.
//
//   1. In the admin console put the show into VOTING (select a contestant, start performance,
//      start voting).
//   2. node scripts/dgl-load-check.mjs --base https://<preview-url> --voters 300 --confirm
//   3. Read the counts and latencies, then Stop voting and use Reset show (type RESET).
//
// One IP casting many votes WILL be flagged by the burst rule (the 26th and later votes within
// 10 s from one IP). That is expected and the admin console shows the flagged count. 429 answers
// are NOT expected: each fake voter casts exactly once, so a 429 means the per-IP limiter
// (DGL.limits.votePerIpPerMin, 5000 a minute per server instance) or a bug.
// Every request gives up after 10 s. Output never includes cookies, tokens or environment values.

import { randomUUID } from "node:crypto";

const BATCH = 50;
const TIMEOUT_MS = 10_000;
// The public state is CDN cached for up to 3 s (max-age 1, stale-while-revalidate 2).
const CDN_WAIT_MS = 4000;
// The live site's host: this is EVENT.url's host in src/data/event.ts, keep in sync. The script
// never runs against it, even by mistake during the real show.
const PRODUCTION_HOSTS = ["devfest2k26.gdgnoida.com"];

function usage(msg) {
  if (msg) console.error(msg + "\n");
  console.error(
    "Usage: node scripts/dgl-load-check.mjs --base <https://preview-url> [--voters 300] --confirm\n" +
      "Requires the show to be in VOTING. --confirm says you are on a preview and the votes may be thrown away.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const baseArg = opt("base");
if (!baseArg) usage();
let base;
try {
  base = new URL(baseArg);
} catch {
  usage("--base is not a URL.");
}
const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
if (base.protocol !== "https:" && !local) usage("--base must be https unless the host is localhost.");
const votersArg = opt("voters");
if (flag("voters") && (votersArg === undefined || votersArg.startsWith("--"))) usage("--voters needs a number.");
const voters = Number(votersArg ?? 300);
if (!Number.isInteger(voters) || voters < 1 || voters > 2000) usage("--voters must be a whole number from 1 to 2000.");
const host = base.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
if (PRODUCTION_HOSTS.includes(host)) usage("Refusing to run: --base is the production site. Use a preview deployment.");
const origin = base.origin;

async function getState() {
  const res = await fetch(`${origin}/api/dgl/state`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`state answered ${res.status}`);
  return res.json();
}

let before;
try {
  before = await getState();
} catch (err) {
  usage(`Could not read ${origin}/api/dgl/state: ${err.message}`);
}
if (before.phase !== "VOTING" || !before.performanceId) {
  usage(`The show is in ${before.phase}, not VOTING. Start voting in the admin console first.`);
}
if (!flag("confirm")) usage("Add --confirm to cast votes. Use a preview deployment only.");

const performanceId = before.performanceId;
console.log(`Casting ${voters} votes in batches of ${BATCH} against ${origin}. Votes before: ${before.votes}`);

async function castOne() {
  const started = performance.now();
  let status = "network";
  try {
    const res = await fetch(`${origin}/api/dgl/vote`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: `dgl_voter=${randomUUID()}`,
      },
      body: JSON.stringify({ performanceId, score: 1 + Math.floor(Math.random() * 10) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = String(res.status);
    await res.arrayBuffer();
  } catch {
    // no answer, or none within TIMEOUT_MS: counted as "network"
  }
  return { status, ms: performance.now() - started };
}

const results = [];
const t0 = performance.now();
for (let sent = 0; sent < voters; sent += BATCH) {
  const n = Math.min(BATCH, voters - sent);
  results.push(...(await Promise.all(Array.from({ length: n }, castOne))));
}
const elapsed = (performance.now() - t0) / 1000;

const counts = new Map();
for (const r of results) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
const recorded = counts.get("200") ?? 0;
const others = [...counts].filter(([s]) => s !== "200").sort(([a], [b]) => a.localeCompare(b));
const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

// Wait out the CDN cache before reading the count back.
await new Promise((r) => setTimeout(r, CDN_WAIT_MS));
let after = null;
try {
  after = await getState();
} catch {
  // reported below
}

console.log(`Done in ${elapsed.toFixed(1)} s`);
console.log(`200 recorded: ${recorded}`);
console.log(`Other answers: ${others.length ? others.map(([s, n]) => `${s}: ${n}`).join(", ") : "none"}`);
console.log(`Latency ms: p50 ${pct(50).toFixed(0)}, p95 ${pct(95).toFixed(0)}, max ${sorted[sorted.length - 1].toFixed(0)}`);
console.log(`Votes before: ${before.votes}, after: ${after ? after.votes : "unreadable"}, expected after: ${before.votes + recorded}`);
console.log("Flagged votes from one IP are expected. Check the admin console, then stop voting and Reset show.");
