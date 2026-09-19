"use client";

import { create } from "zustand";

/**
 * Whether at least half of the billboard is on screen. `HeroVideo` writes it
 * (it plays the loop only while true) and the nav reads it: while the moving
 * picture is under the nav, the scrolled nav uses a solid ground instead of
 * a backdrop blur, because blurring a moving picture every frame is exactly
 * what a weak GPU cannot afford.
 */
export const useHeroView = create<{ inView: boolean; setInView: (v: boolean) => void }>((set) => ({
  inView: true,
  setInView: (inView) => set({ inView }),
}));
