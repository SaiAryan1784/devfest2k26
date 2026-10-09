import type { NextRequest } from "next/server";
import { ensureSchema } from "@/lib/dgl/db";
import { badRequest, config, fail, json, parseTrack, setVoterCookie, unavailable, voterFrom } from "@/lib/dgl/route";
import { myVote } from "@/lib/dgl/votes";

/** The caller's own vote on the current performance (never creates one). */
export async function GET(req: NextRequest) {
  const now = Date.now();
  const track = parseTrack(req.nextUrl.searchParams.get("track"));
  if (!track) return badRequest();
  const cfg = config();
  if (!cfg) return unavailable();
  const voter = voterFrom(req);
  try {
    await ensureSchema(cfg.db);
    const vote = voter.minted ? null : await myVote(cfg.db, voter.id, track);
    const res = json({ serverNow: now, vote });
    return voter.minted ? setVoterCookie(res, voter.id) : res;
  } catch (err) {
    return fail(err);
  }
}
