import type { NextRequest } from "next/server";
import { login } from "@/lib/dgl/auth";
import { ensureSchema } from "@/lib/dgl/db";
import { sameOrigin } from "@/lib/dgl/http";
import {
  badRequest,
  config,
  fail,
  forbidden,
  isObject,
  json,
  readJson,
  setAdminCookie,
  unavailable,
} from "@/lib/dgl/route";

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (!sameOrigin(req)) return forbidden();
  const body = await readJson(req);
  if (!isObject(body) || typeof body.name !== "string" || typeof body.passcode !== "string") {
    return badRequest();
  }
  const cfg = config();
  if (!cfg) return unavailable();
  try {
    await ensureSchema(cfg.db);
    const r = await login(cfg.db, body.name, body.passcode, now);
    if (!r.ok) {
      return r.code === "locked"
        ? json({ error: "locked" }, 423)
        : json({ error: "invalid credentials" }, 401);
    }
    return setAdminCookie(json({ ok: true }), r.admin.id, cfg.secret, now);
  } catch (err) {
    return fail(err);
  }
}
