"use client";

import { create } from "zustand";

/**
 * Hero and nav wait for `done` before running their entrances. `showing` is set
 * by the loader the moment it commits to its sequence: until then the hero is
 * painted under the opaque gate (invisibly, so the browser records the
 * headline's LCP at first paint), and it drops to its hidden state only once
 * there is a sequence to enter from. On the skip path it never hides, and the
 * gate's dissolve is the entrance.
 */
export const useLoaderState = create<{
  done: boolean;
  showing: boolean;
  finish: () => void;
  setShowing: (showing: boolean) => void;
}>((set) => ({
  done: false,
  showing: false,
  finish: () => set({ done: true }),
  setShowing: (showing) => set({ showing }),
}));
