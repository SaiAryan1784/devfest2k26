"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { TrackColor } from "@/data/event";

// The one colour the whole page agrees on right now: the hero wall cycles it,
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

const ORDER: TrackColor[] = ["spectrum", "blue", "red", "yellow", "green"];
const CYCLE_MS = 6500;

/**
 * Advances the shared accent every 6.5 s while `active` and nothing is
 * holding it. The hero wall calls this with "ready, on screen, motion
 * allowed"; it used to live inside the hero's image edges.
 */
export function useAccentCycle(active: boolean) {
  const accent = useAccent((s) => s.accent);
  const setAccent = useAccent((s) => s.setAccent);
  const hold = useAccent((s) => s.hold);
  useEffect(() => {
    if (!active || hold) return;
    const t = setInterval(() => setAccent(ORDER[(ORDER.indexOf(accent) + 1) % ORDER.length]), CYCLE_MS);
    return () => clearInterval(t);
  }, [active, hold, accent, setAccent]);
}
