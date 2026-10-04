import type { NextRequest } from "next/server";
import { currentAdmin } from "@/lib/dgl/auth";
import { ensureSchema } from "@/lib/dgl/db";
import { ADMIN_COOKIE, config, fail, json, unauthorized, unavailable } from "@/lib/dgl/route";
import { readAdminState } from "@/lib/dgl/show";

export async function GET(req: NextRequest) {
  const now = Date.now();
  const cfg = config();
  if (!cfg) return unavailable();
  try {
    await ensureSchema(cfg.db);
    const admin = await currentAdmin(cfg.db, req.cookies.get(ADMIN_COOKIE)?.value, now);
    if (!admin) return unauthorized();
    return json(await readAdminState(cfg.db, admin, now));
  } catch (err) {
    return fail(err);
  }
}
