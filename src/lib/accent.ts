"use client";

import { create } from "zustand";
import type { TrackColor } from "@/data/event";

// The one colour the whole page agrees on right now: hero crossfade sets it,
// the Tracks stack overrides it while a card is active, lockup pills follow it.
type AccentState = { accent: TrackColor; setAccent: (c: TrackColor) => void };

export const useAccent = create<AccentState>((set) => ({
  accent: "spectrum",
  setAccent: (accent) => set({ accent }),
}));
