import { describe, expect, test } from "vitest";
import { clientIp, createLimiter, ipHash, sameOrigin } from "@/lib/dgl/http";

describe("createLimiter", () => {
  test("allows max hits, blocks max+1, and resets after the window", () => {
    const l = createLimiter(3, 1000);
    expect([1, 2, 3].map(() => l.hit("k", 10_000))).toEqual([true, true, true]);
    expect(l.hit("k", 10_500)).toBe(false);
    expect(l.hit("k", 10_999)).toBe(false);
    expect(l.hit("k", 11_000)).toBe(true);
    expect(l.hit("k", 11_001)).toBe(true);
    expect(l.hit("k", 11_002)).toBe(true);
    expect(l.hit("k", 11_003)).toBe(false);
  });

  test("keys are independent", () => {
    const l = createLimiter(1, 1000);
    expect(l.hit("a", 0)).toBe(true);
    expect(l.hit("b", 0)).toBe(true);
    expect(l.hit("a", 1)).toBe(false);
  });

  test("a blocked hit does not extend the window", () => {
    const l = createLimiter(1, 1000);
    expect(l.hit("k", 0)).toBe(true);
    expect(l.hit("k", 900)).toBe(false);
    expect(l.hit("k", 1000)).toBe(true);
  });
});

describe("clientIp", () => {
  const req = (h: Record<string, string>) => new Request("https://x.test/", { headers: h });

  test("picks the first x-forwarded-for entry, trimmed", () => {
    expect(clientIp(req({ "x-forwarded-for": " 1.2.3.4 , 5.6.7.8" }))).toBe("1.2.3.4");
  });

  test("falls back to x-real-ip, then unknown", () => {
    expect(clientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("ipHash", () => {
  test("is 32 hex chars, stable, keyed by the secret and never the raw ip", () => {
    const h = ipHash("1.2.3.4", "s1");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(ipHash("1.2.3.4", "s1")).toBe(h);
    expect(ipHash("1.2.3.4", "s2")).not.toBe(h);
    expect(ipHash("1.2.3.5", "s1")).not.toBe(h);
    expect(h).not.toContain("1.2.3.4");
  });
});

describe("sameOrigin", () => {
  const post = (h: Record<string, string>) =>
    new Request("https://dgl.test/api/dgl/vote", { method: "POST", headers: h });

  test("true when the Origin host is the request host", () => {
    expect(sameOrigin(post({ origin: "https://dgl.test", host: "dgl.test" }))).toBe(true);
    expect(sameOrigin(post({ origin: "https://dgl.test" }))).toBe(true);
  });

  test("false for another host, a bad Origin, or no Origin at all", () => {
    expect(sameOrigin(post({ origin: "https://evil.test", host: "dgl.test" }))).toBe(false);
    expect(sameOrigin(post({ origin: "https://dgl.test.evil.test", host: "dgl.test" }))).toBe(false);
    expect(sameOrigin(post({ origin: "null", host: "dgl.test" }))).toBe(false);
    expect(sameOrigin(post({ origin: "not a url", host: "dgl.test" }))).toBe(false);
    expect(sameOrigin(post({ host: "dgl.test" }))).toBe(false);
  });
});
