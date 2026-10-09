import { DGL } from "@/data/dgl";
import { Confetti } from "./Confetti";

const c = DGL.copy;

/**
 * Between acts, with the host's winner screen on: "Winner" (or "Winners" on a
 * tie), the name or names very large, and the audience score, centred in the
 * space under the banner. The confetti is a sibling leaf, so it exists only
 * while this screen does.
 */
export function Winner({ names, audience }: { names: string[]; audience: number }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <p className="text-[clamp(1.75rem,2.6vw,3rem)] font-medium text-yellow-hi">{names.length > 1 ? c.winnersTitle : c.winnerTitle}</p>
      <h1 className="display max-w-[18ch] text-balance break-words text-[clamp(3.5rem,9vw,11rem)] font-semibold leading-[1.02]">{names.join(" and ")}</h1>
      <p className="font-mono text-[clamp(1.75rem,3vw,3.5rem)] tabular-nums text-muted">{c.winnerScore(audience)}</p>
      <Confetti />
    </div>
  );
}
