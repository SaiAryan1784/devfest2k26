"use client";

import { DGL, DGL_TRACKS } from "@/data/dgl";
import type { Track } from "@/lib/dgl/types";
import { cn } from "@/lib/utils";
import { BTN, GHOST, PRIMARY } from "./admin-styles";

const STORE_KEY = "dgl_track";

/** The track an all-track admin last picked on this device (sessionStorage can throw, so guarded). Read in an effect, never while rendering. */
export function rememberedTrack(): Track | null {
  try {
    const v = window.sessionStorage.getItem(STORE_KEY);
    return DGL_TRACKS.some((t) => t.id === v) ? (v as Track) : null;
  } catch {
    return null;
  }
}

export function rememberTrack(t: Track) {
  try {
    window.sessionStorage.setItem(STORE_KEY, t);
  } catch {
    // Blocked site data: the choice just does not survive a reload.
  }
}

/** Three buttons for an admin who can run every track. A track admin sees a plain label instead (TrackLabel). */
export function TrackSwitcher({ value, onChange }: { value: Track; onChange(t: Track): void }) {
  return (
    <div role="group" aria-label={DGL.copy.admin.trackLabel} className="flex flex-wrap items-center gap-2">
      <span className="text-[15px] text-muted">{DGL.copy.admin.trackLabel}</span>
      {DGL_TRACKS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={value === t.id}
          onClick={() => value !== t.id && onChange(t.id)}
          className={cn(BTN, "h-11 px-4 text-[15px]", value === t.id ? PRIMARY : GHOST)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TrackLabel({ track }: { track: Track }) {
  const label = DGL_TRACKS.find((t) => t.id === track)?.label ?? track;
  return (
    <p className="text-[15px] text-text">
      <span className="text-muted">{DGL.copy.admin.trackLabel}: </span>
      <span className="font-medium">{label}</span>
    </p>
  );
}
