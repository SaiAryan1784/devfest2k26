import { afterEach, expect, test, vi } from "vitest";
import { neonDb } from "@/lib/dgl/db";

afterEach(() => vi.unstubAllEnvs());

test("neonDb returns the same instance for the same URL", () => {
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost/db");
  const a = neonDb();
  expect(a).not.toBeNull();
  expect(neonDb()).toBe(a);
});

test("neonDb returns a fresh instance when the URL changes", () => {
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost/db");
  const a = neonDb();
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost/other");
  const b = neonDb();
  expect(b).not.toBeNull();
  expect(b).not.toBe(a);
});

test("neonDb returns null when DATABASE_URL is unset or empty", () => {
  vi.stubEnv("DATABASE_URL", "");
  expect(neonDb()).toBeNull();
  vi.stubEnv("DATABASE_URL", undefined);
  expect(neonDb()).toBeNull();
});
