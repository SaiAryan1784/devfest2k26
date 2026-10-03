import type { NextRequest } from "next/server";
import { currentAdmin } from "@/lib/dgl/auth";
import { ensureSchema } from "@/lib/dgl/db";
import { sameOrigin } from "@/lib/dgl/http";
import { can } from "@/lib/dgl/machine";
import {
  ADMIN_COOKIE,
  badRequest,
  config,
  fail,
  forbidden,
  hashedIp,
  json,
  kioskLimiter,
  parseVoteBody,
  readJson,
  unauthorized,
  unavailable,
  voteResponse,
} from "@/lib/dgl/route";
import { castVote } from "@/lib/dgl/votes";

/**
 * A vote typed in by a signed-in volunteer or organiser on the venue kiosk.
 * Each one is a fresh anonymous voter, so a kiosk can take many votes; the
 * per-admin gap and the audit row are the brakes.
 */
export async function POST(req: NextRequest) {
  const now = Date.now();
  if (!sameOrigin(req)) return forbidden();
  const body = parseVoteBody(await readJson(req));
  if (!body) return badRequest();
  const cfg = config();
  if (!cfg) return unavailable();
  try {
    await ensureSchema(cfg.db);
    const admin = await currentAdmin(cfg.db, req.cookies.get(ADMIN_COOKIE)?.value, now);
    if (!admin) return unauthorized();
    if (!can(admin.role, "kioskVote")) return forbidden();
    if (!kioskLimiter.hit(admin.id, now)) return json({ status: "rate_limited" }, 429);

    const result = await castVote(cfg.db, {
      performanceId: body.performanceId,
      voterId: `kiosk-${crypto.randomUUID()}`,
      score: body.score,
      ipHash: hashedIp(req, cfg.secret),
      source: "kiosk",
      now,
    });
    if (result.status === "recorded") {
      // The vote is already stored, so a failed audit write must not turn a
      // recorded vote into a 503 (the device would retry and double count).
      try {
        await cfg.db.query(
          `INSERT INTO dgl_audit (at, admin_id, admin_name, action, performance_id, detail)
           VALUES (to_timestamp($1::float8 / 1000.0), $2::uuid, $3::text, 'kioskVote', $4::uuid, '{}'::jsonb)`,
          [now, admin.id, admin.name, body.performanceId],
        );
      } catch (err) {
        console.error("DGL kiosk audit failed:", err instanceof Error ? err.name : "unknown");
      }
    }
    return voteResponse(result);
  } catch (err) {
    return fail(err);
  }
}
