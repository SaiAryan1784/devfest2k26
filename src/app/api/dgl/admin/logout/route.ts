import type { NextRequest } from "next/server";
import { sameOrigin } from "@/lib/dgl/http";
import { clearAdminCookie, forbidden, json } from "@/lib/dgl/route";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbidden();
  return clearAdminCookie(json({ ok: true }));
}
