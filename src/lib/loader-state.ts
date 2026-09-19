"use client";

import { create } from "zustand";

/**
 * Hero and nav wait for `done` before running their entrances. `showing` is set
 * by the loader the moment it commits to its sequence: until then the hero is
 * painted under the opaque gate (invisibly, so the browser records the
 * headline's LCP at first paint), and it drops to its hidden state only once
 * there is a sequence to enter from. On the skip path it never hides, and the
 * gate's dissolve is the entrance.
 *
 * `landed` comes after `done`: the loader's mark has arrived on the hero's copy
 * and the gate is unmounting in the same commit. The hero's light (`Prism`)
 * draws its first frame at that moment, so the loader's last frame and the
 * hero's first are the same picture and the swap between them is invisible.
 */
export const useLoaderState = create<{
  done: boolean;
  showing: boolean;
  landed: boolean;
  finish: () => void;
  land: () => void;
  setShowing: (showing: boolean) => void;
}>((set) => ({
  done: false,
  showing: false,
  landed: false,
  finish: () => set({ done: true }),
  land: () => set({ done: true, landed: true }),
  setShowing: (showing) => set({ showing }),
}));
