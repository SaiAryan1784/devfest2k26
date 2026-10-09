import { expect, test } from "vitest";
import { canAccessTrack, defaultTrackFor, isTrack, trackLabel } from "@/lib/dgl/tracks";
import { stateUrl, meUrl, adminStateUrl } from "@/lib/dgl/client-http";

test("isTrack accepts the three slugs only", () => {
  for (const t of ["build", "grow", "think"]) expect(isTrack(t)).toBe(true);
  for (const t of ["", "Build", "all", null, undefined, 3]) expect(isTrack(t)).toBe(false);
});

test("an all-track admin reaches every track, a track admin only their own", () => {
  for (const t of ["build", "grow", "think"] as const) expect(canAccessTrack(null, t)).toBe(true);
  expect(canAccessTrack("grow", "grow")).toBe(true);
  expect(canAccessTrack("grow", "build")).toBe(false);
});

test("default track and label", () => {
  expect(defaultTrackFor(null)).toBe("build");
  expect(defaultTrackFor("think")).toBe("think");
  expect(trackLabel("grow")).toBe("Grow");
});

test("client URLs carry the track", () => {
  expect(stateUrl("grow")).toBe("/api/dgl/state?track=grow");
  expect(meUrl("think")).toBe("/api/dgl/me?track=think");
  expect(adminStateUrl("build")).toBe("/api/dgl/admin/state?track=build");
  expect(adminStateUrl(null)).toBe("/api/dgl/admin/state");
});
