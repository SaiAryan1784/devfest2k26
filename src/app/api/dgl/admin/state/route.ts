import type { NextRequest } from "next/server";
import { currentAdmin } from "@/lib/dgl/auth";
import { ensureSchema } from "@/lib/dgl/db";
import { ADMIN_COOKIE, badRequest, config, fail, forbidden, json, parseTrack, unauthorized, unavailable } from "@/lib/dgl/route";
import { canAccessTrack, defaultTrackFor } from "@/lib/dgl/tracks";
import { readAdminState } from "@/lib/dgl/show";

export async function GET(req: NextRequest) {
  const now = Date.now();
  const cfg = config();
  if (!cfg) return unavailable();
  try {
    await ensureSchema(cfg.db);
    const admin = await currentAdmin(cfg.db, req.cookies.get(ADMIN_COOKIE)?.value, now);
    if (!admin) return unauthorized();
    // No track asked for: the admin's own, else build. A track that is not one is a bad request.
    const asked = req.nextUrl.searchParams.get("track");
    const track = asked === null ? defaultTrackFor(admin.track) : parseTrack(asked);
    if (!track) return badRequest();
    if (!canAccessTrack(admin.track, track)) return forbidden();
    return json(await readAdminState(cfg.db, admin, track, now));
  } catch (err) {
    return fail(err);
  }
}
