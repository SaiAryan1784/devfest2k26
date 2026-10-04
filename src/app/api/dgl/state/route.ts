import { config, fail, json, unavailable } from "@/lib/dgl/route";
import { ensureSchema } from "@/lib/dgl/db";
import { readPublicState } from "@/lib/dgl/show";

/**
 * Public show state. Cacheable at the CDN for a second (so a room full of
 * phones polling collapses into about one database read per second) and never
 * sets a cookie, which would make a shared cache refuse to store it.
 */
const CACHE = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "max-age=1, stale-while-revalidate=2",
};

export async function GET() {
  const now = Date.now();
  const cfg = config();
  if (!cfg) return unavailable();
  try {
    await ensureSchema(cfg.db);
    return json(await readPublicState(cfg.db, now), 200, CACHE);
  } catch (err) {
    return fail(err);
  }
}
