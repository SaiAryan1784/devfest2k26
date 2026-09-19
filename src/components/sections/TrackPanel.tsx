"use client";

import { LightPipe } from "@/components/brand/LightPipe";
import { PAL } from "@/components/brand/slabs";
import type { Track } from "@/data/tracks";
import { useAccent } from "@/lib/accent";
import { cn } from "@/lib/utils";

/**
 * One track: the copy on the left, the track's own light-pipe mark large on
 * the right, in its one colour. The panel is opaque because the stack scales
 * cards over each other; its only decoration is a hairline of the track
 * colour along the top and a static bloom behind the mark. The pulse of
 * light runs through the pipe on the card the stack currently holds on top
 * (the shared accent), and only there.
 */
export function TrackPanel({ track, index, total, className }: { track: Track; index: number; total: number; className?: string }) {
  const accent = useAccent((s) => s.accent);
  const active = accent === track.color;
  const p = PAL[track.color];

  return (
    <article className={cn("relative isolate w-full overflow-hidden rounded-panel border border-hair bg-surface", className)}>
      <span aria-hidden="true" className="absolute inset-x-[12%] top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${p.mid}, transparent)` }} />

      <div className="grid min-h-[340px] grid-cols-1 gap-10 p-7 sm:p-10 lg:min-h-[56vh] lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:p-14">
        <div className="order-2 lg:order-1">
          <p className="label mb-5 flex items-center gap-3">
            <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: p.mid }} />
            <span>
              <span className="text-text">{String(index + 1).padStart(2, "0")}</span> / {String(total).padStart(2, "0")}
            </span>
            <span>{track.tagline}</span>
          </p>
          <h3 className="display mb-4 text-[clamp(2.6rem,6vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">{track.name}</h3>
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-muted">{track.description}</p>
          <p className="label mt-8 !text-text">{track.format}</p>
        </div>

        <div className="relative order-1 w-[min(44vw,200px)] justify-self-end lg:order-2 lg:w-[clamp(220px,26vw,400px)]">
          <div aria-hidden="true" className="absolute -inset-[28%] rounded-full" style={{ background: `radial-gradient(closest-side, ${p.mid}3d, transparent)` }} />
          <LightPipe shape={track.glyph} color={track.color} run={active} className="relative w-full" />
        </div>
      </div>
    </article>
  );
}
