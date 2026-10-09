import { CircleNotch } from "@phosphor-icons/react";
import { DGL } from "@/data/dgl";
import type { Act } from "@/lib/dgl/audience-view";
import { cn } from "@/lib/utils";
import { ActClock } from "./ActClock";

const c = DGL.copy;

/**
 * The act in one card: a status line (and the "90 sec" clock on its right
 * while the act is on), the performer's name and their prompt. Names and
 * prompts can be 200 characters: the name is clamped to two lines and the
 * prompt to three (visually only; a screen reader still reads all of it), and
 * long unbroken words wrap instead of running off the side. While the wheel
 * spins the prompt is null and a turning icon with "Spinning the wheel..."
 * stands in for it. `compact` (the voting grid) tightens on short screens so
 * the grid and "Lock in" fit without scrolling. Radius 20, the card radius.
 */
export function ActCard({ act, status, clock, compact = false }: { act: Act; status?: string; clock?: { endsAtMs: number; offset: number }; compact?: boolean }) {
  if (!status && !clock && !act.contestant && !act.prompt && !act.spinning) return null;
  return (
    <div className={cn("glass flex flex-col gap-1 rounded-[20px] p-5", compact && "[@media(max-height:700px)]:p-3")}>
      {(status || clock) && (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] text-muted">{status}</p>
          {clock && <ActClock endsAtMs={clock.endsAtMs} offset={clock.offset} />}
        </div>
      )}
      {act.contestant && (
        <h2 className={cn("display line-clamp-2 break-words text-[32px] font-semibold leading-[1.1]", compact && "[@media(max-height:700px)]:text-[24px]")}>{act.contestant}</h2>
      )}
      {act.spinning && (
        <p className="mt-1 flex items-center gap-2 text-[20px] font-medium leading-snug text-yellow-hi">
          {/* .dgl-turn keeps turning under reduced motion on purpose, see globals.css. */}
          <CircleNotch aria-hidden="true" weight="regular" className="dgl-turn size-6 shrink-0" />
          {c.spinning}
        </p>
      )}
      {act.prompt && (
        <p
          className={cn(
            "mt-1 line-clamp-3 break-words text-[17px] leading-snug text-muted",
            compact && "[@media(max-height:700px)]:mt-0 [@media(max-height:700px)]:text-[15px] [@media(max-height:700px)]:leading-[1.3]",
          )}
        >
          {act.prompt}
        </p>
      )}
    </div>
  );
}
