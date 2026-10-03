import type { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/dgl/db";
import { sameOrigin } from "@/lib/dgl/http";
import {
  badRequest,
  config,
  fail,
  forbidden,
  hashedIp,
  ipLimiter,
  json,
  parseVoteBody,
  readJson,
  setVoterCookie,
  unavailable,
  voteResponse,
  voterFrom,
  voterLimiter,
} from "@/lib/dgl/route";
import { castVote } from "@/lib/dgl/votes";

/** An audience vote. The voter is the `dgl_voter` cookie, minted here if missing. */
export async function POST(req: NextRequest) {
  const now = Date.now();
  if (!sameOrigin(req)) return forbidden();
  const body = parseVoteBody(await readJson(req));
  if (!body) return badRequest();
  const cfg = config();
  if (!cfg) return unavailable();

  const voter = voterFrom(req);
  const finish = (res: NextResponse) => (voter.minted ? setVoterCookie(res, voter.id) : res);
  const ip = hashedIp(req, cfg.secret);
  // Both limiters are hit on every attempt; either one blocking is a 429.
  const voterOk = voterLimiter.hit(`voter:${voter.id}`, now);
  const ipOk = ipLimiter.hit(`ip:${ip}`, now);
  if (!voterOk || !ipOk) return finish(json({ status: "rate_limited" }, 429));

  try {
    await ensureSchema(cfg.db);
    const result = await castVote(cfg.db, {
      performanceId: body.performanceId,
      voterId: voter.id,
      score: body.score,
      ipHash: ip,
      source: "web",
      now,
    });
    return finish(voteResponse(result));
  } catch (err) {
    return finish(fail(err));
  }
}
