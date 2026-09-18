"use client";

import Image from "next/image";
import { GlassSlabs } from "@/components/brand/GlassSlabs";
import GlareHover from "@/components/reactbits/GlareHover";
import type { Track } from "@/data/tracks";
import { cn } from "@/lib/utils";

export function TrackPanel({ track, className, sheen = false }: { track: Track; className?: string; sheen?: boolean }) {
  return (
    <GlareHover
      className={cn("relative isolate w-full overflow-hidden rounded-panel border border-hair bg-surface", className)}
      width="100%"
      height="auto"
      background="#0b0b0d"
      borderRadius="24px"
      borderColor="transparent"
      glareColor="#ffffff"
      glareOpacity={0.12}
      glareAngle={-30}
      glareSize={260}
      transitionDuration={900}
      style={{ cursor: "default" }}
    >
      <article className="relative grid min-h-[340px] w-full grid-cols-1 gap-8 p-7 sm:p-10 lg:min-h-[70vh] lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
        <GlassSlabs side="left" color={track.color} sheen={sheen} alive className="hidden w-[34%] lg:block" />
        <GlassSlabs side="right" color={track.color} sheen={sheen} alive className="w-[38%] opacity-80 lg:w-[34%] lg:opacity-100" />

        <div className="relative pr-[24%] lg:pl-[24%] lg:pr-0">
          <Image
            src={`/brand/glyphs/${track.glyph}.webp`}
            alt=""
            width={96}
            height={96}
            className="mb-6 size-16 rounded-card lg:size-24"
          />
          <p className="label mb-3">{track.tagline}</p>
          <h3 className="display mb-4 text-[clamp(2.6rem,6vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.04em]">{track.name}</h3>
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-muted">{track.description}</p>
        </div>

        <p className="label relative whitespace-nowrap lg:mr-[36%] lg:self-start">{track.format}</p>
      </article>
    </GlareHover>
  );
}
