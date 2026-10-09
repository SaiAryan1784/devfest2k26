// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { LazyMotion, domAnimation } from "motion/react";
import { afterEach, expect, test, vi } from "vitest";
import { Console } from "@/components/dgl/AdminConsole";
import type { AdminState } from "@/lib/dgl/types";
import type { UseAdmin } from "@/lib/dgl/use-admin";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: AdminState = {
  track: "build",
  phase: "READY",
  performanceId: "11111111-1111-4111-8111-111111111111",
  contestant: "Sai",
  prompt: null,
  spunAtMs: null,
  endsAtMs: null,
  votes: 0,
  average: null,
  reveal: null,
  winner: null,
  version: 3,
  serverNow: 1,
  selfScore: 3,
  rawAverage: null,
  flagged: 0,
  excluded: 0,
  kiosk: 0,
  prompts: [{ id: "a", text: "x", active: true }],
  me: { name: "Sai", role: "HOST", track: null },
  acts: [],
  leaders: null,
  winnerShown: false,
};

const admin = (state: AdminState): UseAdmin => ({
  state,
  act: async () => null,
  error: null,
  session: "signedIn",
  connection: "live",
  offset: 0,
  busy: false,
  changedAt: null,
  settling: false,
  refresh() {},
  signOut: async () => {},
});

afterEach(() => vi.restoreAllMocks());

// The console polls every second and re-renders. Two sibling panels once shared the act id as
// their key, and React then added one more "Fix the name" box per poll.
test("polling re-renders never duplicate a panel, and React reports no duplicate key", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  const render = (state: AdminState) =>
    act(() => root.render(createElement(LazyMotion, { features: domAnimation }, createElement(Console, { admin: admin(state), state, onTrack() {} }))));
  const count = (title: string) => [...el.querySelectorAll("h2")].filter((h) => h.textContent === title).length;

  await render(base);
  for (let i = 0; i < 5; i++) await render({ ...base, serverNow: 2 + i, version: 3 + i, phase: i % 2 ? "READY" : "PERFORMING" });

  expect(count("Fix the name")).toBe(1);
  expect(count("Own score")).toBe(1);
  expect(errors.mock.calls.filter((c) => String(c[0]).includes("same key"))).toEqual([]);
});
