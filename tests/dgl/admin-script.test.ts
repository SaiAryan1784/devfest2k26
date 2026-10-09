import { describe, expect, test } from "vitest";
import { parseArgs } from "../../scripts/dgl-admin";

describe("dgl-admin parseArgs", () => {
  test("accepts the two roles", () => {
    expect(parseArgs(["--name", "Sai", "--role", "SUPER_ADMIN"])).toEqual({ name: "Sai", role: "SUPER_ADMIN", track: null });
    expect(parseArgs(["--name", " Neha ", "--role", "HOST"])).toEqual({ name: "Neha", role: "HOST", track: null });
    expect(parseArgs(["--name", "Build Admin", "--role", "SUPER_ADMIN", "--track", "build"])).toEqual({ name: "Build Admin", role: "SUPER_ADMIN", track: "build" });
    expect(parseArgs(["--name", "X", "--role", "HOST", "--track", "all"])).toMatchObject({ track: null });
    expect(parseArgs(["--name", "X", "--role", "HOST", "--track", "nope"])).toHaveProperty("error");
  });

  test("refuses the retired roles and anything else", () => {
    for (const role of ["OPERATOR", "VOLUNTEER", "host", "ROOT"]) {
      expect(parseArgs(["--name", "Sai", "--role", role]), role).toEqual({ error: `Unknown role "${role}".` });
    }
  });

  test("needs a name and a role", () => {
    expect(parseArgs(["--role", "HOST"])).toEqual({ error: "Missing --name." });
    expect(parseArgs(["--name", "Sai"])).toEqual({ error: "Missing --role." });
  });
});
