import { describe, expect, test } from "vitest";
import { parseArgs } from "../../scripts/dgl-admin";

describe("dgl-admin parseArgs", () => {
  test("accepts the two roles", () => {
    expect(parseArgs(["--name", "Sai", "--role", "SUPER_ADMIN"])).toEqual({ name: "Sai", role: "SUPER_ADMIN" });
    expect(parseArgs(["--name", " Neha ", "--role", "HOST"])).toEqual({ name: "Neha", role: "HOST" });
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
