import type { NextRequest } from "next/server";
import { currentAdmin } from "@/lib/dgl/auth";
import { ensureSchema } from "@/lib/dgl/db";
import { sameOrigin } from "@/lib/dgl/http";
import {
  ACTION_STATUS,
  ADMIN_COOKIE,
  badRequest,
  config,
  fail,
  forbidden,
  isObject,
  json,
  parseTrack,
  readJson,
  unauthorized,
  unavailable,
} from "@/lib/dgl/route";
import { applyAction } from "@/lib/dgl/show";
import { canAccessTrack } from "@/lib/dgl/tracks";
import type { Action } from "@/lib/dgl/types";

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (!sameOrigin(req)) return forbidden();
  const body = await readJson(req);
  if (
    !isObject(body) ||
    !isObject(body.action) ||
    !parseTrack(body.track) ||
    typeof body.action.type !== "string" ||
    typeof body.version !== "number" ||
    !Number.isInteger(body.version)
  ) {
    return badRequest();
  }
  const cfg = config();
  if (!cfg) return unavailable();
  try {
    await ensureSchema(cfg.db);
    const admin = await currentAdmin(cfg.db, req.cookies.get(ADMIN_COOKIE)?.value, now);
    if (!admin) return unauthorized();
    const track = parseTrack(body.track)!;
    if (!canAccessTrack(admin.track, track)) return forbidden();
    const result = await applyAction(cfg.db, admin, track, body.action as unknown as Action, body.version, now);
    return json(result, result.ok ? 200 : ACTION_STATUS[result.code]);
  } catch (err) {
    return fail(err);
  }
}
