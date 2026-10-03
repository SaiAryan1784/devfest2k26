import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

// The worker is plain JS with no build step. It exports its pure decisions when `module` exists
// (never in a browser worker), so they can be exercised here in node.
const require = createRequire(import.meta.url);
const sw = require("../../public/dgl-sw.js") as {
  CACHE: string;
  route: (req: Req, origin: string) => "shell" | "static" | null;
  shouldHandle: (req: Req, origin: string) => boolean;
  isCacheableResponse: (res: Res) => boolean;
  networkFirst: (
    req: Req,
    cache: CacheLike,
    fetchFn: (req: Req) => Promise<Res>,
    timeoutMs: number,
    timers?: Timers,
  ) => Promise<Res>;
  cacheFirst: (req: Req, cache: CacheLike, fetchFn: (req: Req) => Promise<Res>) => Promise<Res>;
};

type Req = { method: string; url: string; mode: string };
type Res = { ok: boolean; type: string; redirected: boolean; id?: string; clone: () => Res };
type CacheLike = {
  match: (key: string) => Promise<Res | undefined>;
  put: (key: string, res: Res) => Promise<void>;
};
type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

const ORIGIN = "https://site.test";
const req = (path: string, over: Partial<Req> = {}): Req => ({
  method: "GET",
  url: ORIGIN + path,
  mode: "cors",
  ...over,
});
const nav = (path: string, over: Partial<Req> = {}) => req(path, { mode: "navigate", ...over });

const res = (id: string, over: Partial<Res> = {}): Res => {
  const r: Res = { ok: true, type: "basic", redirected: false, id, clone: () => ({ ...r, id: id + "-clone" }), ...over };
  return r;
};

function fakeCache(initial: Record<string, Res> = {}) {
  const store = new Map(Object.entries(initial));
  const put = vi.fn(async (key: string, r: Res) => {
    store.set(key, r);
  });
  const cache: CacheLike = { match: async (key) => store.get(key), put };
  return { cache, store, put };
}

// A manual timer: the test decides when it fires.
function manualTimers() {
  let fire: (() => void) | null = null;
  const timers: Timers = {
    setTimeout: (fn) => {
      fire = fn;
      return 1;
    },
    clearTimeout: () => {
      fire = null;
    },
  };
  return { timers, trip: () => fire?.() };
}

describe("shouldHandle / route", () => {
  it("handles GET navigations under /dgl", () => {
    for (const p of ["/dgl", "/dgl/stage", "/dgl/admin", "/dgl/kiosk"]) {
      expect(sw.shouldHandle(nav(p), ORIGIN), p).toBe(true);
      expect(sw.route(nav(p), ORIGIN)).toBe("shell");
    }
  });

  it("handles /_next/static assets", () => {
    const r = req("/_next/static/chunks/a.js");
    expect(sw.shouldHandle(r, ORIGIN)).toBe(true);
    expect(sw.route(r, ORIGIN)).toBe("static");
  });

  it("ignores non-GET", () => {
    expect(sw.shouldHandle(nav("/dgl", { method: "POST" }), ORIGIN)).toBe(false);
    expect(sw.shouldHandle(req("/_next/static/chunks/a.js", { method: "POST" }), ORIGIN)).toBe(false);
  });

  it("never touches the API, images, other origins or the main site", () => {
    expect(sw.shouldHandle(req("/api/dgl/vote"), ORIGIN)).toBe(false);
    expect(sw.shouldHandle(req("/api/dgl/state"), ORIGIN)).toBe(false);
    expect(sw.shouldHandle(nav("/api/dgl/state"), ORIGIN)).toBe(false);
    expect(sw.shouldHandle(req("/_next/image?url=%2Fa.png&w=64&q=75"), ORIGIN)).toBe(false);
    expect(sw.shouldHandle({ method: "GET", url: "https://evil.test/_next/static/a.js", mode: "cors" }, ORIGIN)).toBe(false);
    expect(sw.shouldHandle({ method: "GET", url: "https://evil.test/dgl", mode: "navigate" }, ORIGIN)).toBe(false);
    expect(sw.shouldHandle(nav("/"), ORIGIN)).toBe(false);
    expect(sw.shouldHandle(nav("/dglfoo"), ORIGIN)).toBe(false);
  });

  it("does not treat a non-navigation fetch of a /dgl path (RSC, data) as the shell", () => {
    expect(sw.shouldHandle(req("/dgl"), ORIGIN)).toBe(false);
  });
});

describe("isCacheableResponse", () => {
  it("is true only for ok + basic + not redirected", () => {
    expect(sw.isCacheableResponse(res("a"))).toBe(true);
    expect(sw.isCacheableResponse(res("a", { ok: false }))).toBe(false);
    expect(sw.isCacheableResponse(res("a", { type: "opaque" }))).toBe(false);
    expect(sw.isCacheableResponse(res("a", { type: "cors" }))).toBe(false);
    expect(sw.isCacheableResponse(res("a", { redirected: true }))).toBe(false);
  });
});

describe("networkFirst", () => {
  it("prefers the network when it answers in time, and caches a clone", async () => {
    const { cache, put } = fakeCache({ [ORIGIN + "/dgl"]: res("old") });
    const net = res("net");
    const { timers } = manualTimers();
    const out = await sw.networkFirst(nav("/dgl"), cache, async () => net, 4000, timers);
    expect(out).toBe(net);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe(ORIGIN + "/dgl");
    expect(put.mock.calls[0][1].id).toBe("net-clone");
  });

  it("falls back to the cached copy on a network error", async () => {
    const old = res("old");
    const { cache } = fakeCache({ [ORIGIN + "/dgl/stage"]: old });
    const { timers } = manualTimers();
    const out = await sw.networkFirst(nav("/dgl/stage"), cache, async () => Promise.reject(new TypeError("offline")), 4000, timers);
    expect(out).toBe(old);
  });

  it("falls back to the cached copy on a timeout", async () => {
    const old = res("old");
    const { cache } = fakeCache({ [ORIGIN + "/dgl/stage"]: old });
    const { timers, trip } = manualTimers();
    const never = new Promise<Res>(() => {});
    const p = sw.networkFirst(nav("/dgl/stage"), cache, () => never, 4000, timers);
    trip();
    expect(await p).toBe(old);
  });

  it("falls back to the cached /dgl shell when that URL was never cached", async () => {
    const shell = res("shell");
    const { cache } = fakeCache({ [ORIGIN + "/dgl"]: shell });
    const { timers } = manualTimers();
    const out = await sw.networkFirst(nav("/dgl/kiosk"), cache, async () => Promise.reject(new TypeError("offline")), 4000, timers);
    expect(out).toBe(shell);
  });

  it("propagates the error when nothing is cached", async () => {
    const { cache } = fakeCache();
    const { timers } = manualTimers();
    await expect(
      sw.networkFirst(nav("/dgl"), cache, async () => Promise.reject(new TypeError("offline")), 4000, timers),
    ).rejects.toThrow("offline");
  });

  it("keeps waiting for the network on a timeout when nothing is cached", async () => {
    const { cache } = fakeCache();
    const { timers, trip } = manualTimers();
    let resolveNet: (r: Res) => void = () => {};
    const slow = new Promise<Res>((r) => (resolveNet = r));
    const p = sw.networkFirst(nav("/dgl"), cache, () => slow, 4000, timers);
    trip();
    const net = res("late");
    resolveNet(net);
    expect(await p).toBe(net);
  });

  it("never caches a non-ok, redirected or opaque response, but still returns it", async () => {
    for (const over of [{ ok: false }, { redirected: true }, { type: "opaque" }]) {
      const { cache, put } = fakeCache();
      const { timers } = manualTimers();
      const bad = res("bad", over);
      const out = await sw.networkFirst(nav("/dgl"), cache, async () => bad, 4000, timers);
      expect(out).toBe(bad);
      expect(put).not.toHaveBeenCalled();
    }
  });

  // Lets every pending promise callback run (the late network answer and its cache write).
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("does NOT store a late answer when this URL already had a cached copy (its chunks were never fetched)", async () => {
    const old = res("old");
    const { cache, put, store } = fakeCache({ [ORIGIN + "/dgl/stage"]: old });
    const { timers, trip } = manualTimers();
    let resolveNet: (r: Res) => void = () => {};
    const slow = new Promise<Res>((r) => (resolveNet = r));
    const p = sw.networkFirst(nav("/dgl/stage"), cache, () => slow, 4000, timers);
    trip();
    expect(await p).toBe(old);
    resolveNet(res("late"));
    await settle();
    expect(put).not.toHaveBeenCalled();
    expect(store.get(ORIGIN + "/dgl/stage")).toBe(old);
  });

  it("stores a late answer when nothing was cached for that URL (the /dgl shell stood in)", async () => {
    const shell = res("shell");
    const { cache, put, store } = fakeCache({ [ORIGIN + "/dgl"]: shell });
    const { timers, trip } = manualTimers();
    let resolveNet: (r: Res) => void = () => {};
    const slow = new Promise<Res>((r) => (resolveNet = r));
    const p = sw.networkFirst(nav("/dgl/kiosk"), cache, () => slow, 4000, timers);
    trip();
    expect(await p).toBe(shell);
    resolveNet(res("late"));
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe(ORIGIN + "/dgl/kiosk");
    expect(store.get(ORIGIN + "/dgl/kiosk")?.id).toBe("late-clone");
    expect(store.get(ORIGIN + "/dgl")).toBe(shell);
  });

  it("stores a late answer when nothing at all was cached (the page waited for it)", async () => {
    const { cache, put } = fakeCache();
    const { timers, trip } = manualTimers();
    let resolveNet: (r: Res) => void = () => {};
    const slow = new Promise<Res>((r) => (resolveNet = r));
    const p = sw.networkFirst(nav("/dgl"), cache, () => slow, 4000, timers);
    trip();
    resolveNet(res("late"));
    expect((await p).id).toBe("late");
    await settle();
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("passes the configured timeout to the timer", async () => {
    const { cache } = fakeCache();
    const setTimeout = vi.fn(() => 1);
    await sw.networkFirst(nav("/dgl"), cache, async () => res("n"), 4000, { setTimeout, clearTimeout: () => {} });
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 4000);
  });
});

describe("cacheFirst", () => {
  it("serves from the cache without hitting the network", async () => {
    const hit = res("hit");
    const { cache } = fakeCache({ [ORIGIN + "/_next/static/a.js"]: hit });
    const fetchFn = vi.fn();
    expect(await sw.cacheFirst(req("/_next/static/a.js"), cache, fetchFn)).toBe(hit);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fetches and caches a clone of an ok response on a miss", async () => {
    const { cache, put } = fakeCache();
    const net = res("net");
    expect(await sw.cacheFirst(req("/_next/static/a.js"), cache, async () => net)).toBe(net);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].id).toBe("net-clone");
  });

  it("does not cache a failed asset", async () => {
    const { cache, put } = fakeCache();
    await sw.cacheFirst(req("/_next/static/a.js"), cache, async () => res("bad", { ok: false }));
    expect(put).not.toHaveBeenCalled();
  });
});

describe("cache name", () => {
  it("is dgl-v1", () => {
    expect(sw.CACHE).toBe("dgl-v1");
  });
});
