"use client";

import { create } from "zustand";

// Hero and nav wait for this before running their entrances.
export const useLoaderState = create<{ done: boolean; finish: () => void }>((set) => ({
  done: false,
  finish: () => set({ done: true }),
}));
