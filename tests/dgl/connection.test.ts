import { expect, test } from "vitest";
import { DGL } from "@/data/dgl";
import { connectionFor } from "@/lib/dgl/connection";

test("connecting until the first answer, never live before it (the server render is connecting too)", () => {
  // The server snapshot of navigator.onLine is true and nothing has answered yet.
  expect(connectionFor(true, false, false)).toBe("connecting");
  expect(connectionFor(true, false, true)).toBe("live");
});

test("offline wins, then reconnecting, whether or not anything answered", () => {
  expect(connectionFor(false, false, false)).toBe("offline");
  expect(connectionFor(false, true, true)).toBe("offline");
  expect(connectionFor(true, true, false)).toBe("reconnecting");
  expect(connectionFor(true, true, true)).toBe("reconnecting");
});

test("every connection has its word in DGL.copy", () => {
  expect(DGL.copy.connection).toEqual({ connecting: "Connecting", live: "Live", reconnecting: "Reconnecting", offline: "Offline" });
});
