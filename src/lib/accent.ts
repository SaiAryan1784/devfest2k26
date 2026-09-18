"use client";

import { create } from "zustand";
import type { TrackColor } from "@/data/event";

// The one colour the whole page agrees on right now: hero crossfade sets it,
// the Tracks stack overrides it while a card is active, lockup pills follow
// it. `hold` pauses the hero's own auto-cycle while something else (a
// hovered or focused track dot) is deliberately choosing the colour.
type AccentState = {
  accent: TrackColor;
  hold: boolean;
  setAccent: (c: TrackColor) => void;
  setHold: (hold: boolean) => void;
};

export const useAccent = create<AccentState>((set) => ({
  accent: "spectrum",
  hold: false,
  setAccent: (accent) => set({ accent }),
  setHold: (hold) => set({ hold }),
}));
