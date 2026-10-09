/* global self, caches, fetch, setTimeout, clearTimeout */
// DGL offline shell. Rule: only /dgl page navigations and /_next/static assets are intercepted;
// everything else (every /api/ call, other origins, non-GET) passes straight through, so a vote
// or a state poll is never answered from a cache.
//
// Kill switch: to retire this worker, ship a version of this file that keeps `skipWaiting()` in its
// `install` handler, has NO `fetch` handler, and whose `activate` handler deletes every `dgl-`
// cache and calls `self.registration.unregister()`. In the same release remove `<RegisterSw />`
// from src/app/dgl/layout.tsx, so nothing registers a worker again. Browsers re-fetch the script
// on navigation (at the latest every 24 h) and install it over this one.
// This file is served from Next's public folder at /dgl-sw.js, registered with scope "/dgl".
"use strict";

const CACHE = "dgl-v2";
const TIMEOUT_MS = 4000;
const TIMED_OUT = {};

// "shell" (page navigation under /dgl), "static" (/_next/static asset) or null (not ours).
function route(request, origin) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.origin !== origin) return null;
  const p = url.pathname;
  if (request.mode === "navigate" && (p === "/dgl" || p.startsWith("/dgl/"))) return "shell";
  if (p.startsWith("/_next/static/")) return "static";
  return null;
}

function shouldHandle(request, origin) {
  return route(request, origin) !== null;
}

// Never store errors, redirects or opaque responses: a cached 500 would outlive the outage.
function isCacheableResponse(response) {
  return Boolean(response && response.ok && response.type === "basic" && !response.redirected);
}

function store(cache, key, response) {
  if (!isCacheableResponse(response)) return;
  try {
    Promise.resolve(cache.put(key, response.clone())).catch(() => {});
  } catch {
    // A failed cache write must never fail the page.
  }
}

// Network first. If the network errors or has not answered within timeoutMs, serve the cached
// copy of this URL, else the cached /dgl shell. With nothing cached, keep waiting for the network.
//
// The answer is stored when the network won the race. An answer that lands after the timeout is
// stored only if this URL had no cached copy: the page was served from the old copy, so the new
// HTML's chunks were never fetched, and storing it would leave a later offline reload with HTML
// whose chunks are not in the cache.
async function networkFirst(request, cache, fetchFn, timeoutMs, timers) {
  const t = timers || { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
  const key = request.url;
  const network = Promise.resolve().then(() => fetchFn(request));
  network.catch(() => {}); // a late failure after the timeout must not surface as unhandled

  let timer;
  const timeout = new Promise((resolve) => {
    timer = t.setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  let failure = null;
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== TIMED_OUT) {
      store(cache, key, first);
      return first;
    }
  } catch (err) {
    failure = err;
  } finally {
    t.clearTimeout(timer);
  }

  const own = await cache.match(key);
  if (!own && !failure) {
    network.then(
      (response) => store(cache, key, response),
      () => {},
    );
  }
  const cached = own || (await cache.match(new URL("/dgl", key).href));
  if (cached) return cached;
  if (failure) throw failure;
  return network;
}

// Cache first, filled on use. Hashed build assets never change under the same URL.
async function cacheFirst(request, cache, fetchFn) {
  const key = request.url;
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await fetchFn(request);
  store(cache, key, response);
  return response;
}

if (typeof module !== "undefined" && module.exports) {
  // Node (tests) only: a worker global scope has no `module`.
  module.exports = { CACHE, route, shouldHandle, isCacheableResponse, networkFirst, cacheFirst };
} else {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((names) => Promise.all(names.filter((n) => n.startsWith("dgl-") && n !== CACHE).map((n) => caches.delete(n))))
        .then(() => self.clients.claim()),
    );
  });

  self.addEventListener("fetch", (event) => {
    const kind = route(event.request, self.location.origin);
    if (kind === null) return; // no respondWith: the browser handles it, no cache in the path
    const go = (fetchFn) =>
      caches.open(CACHE).then((cache) =>
        kind === "shell" ? networkFirst(event.request, cache, fetchFn, TIMEOUT_MS) : cacheFirst(event.request, cache, fetchFn),
      );
    event.respondWith(go((r) => fetch(r)));
  });
}
