import type { TrackColor } from "@/data/event";

/**
 * Palettes for the brand's light. One four-step ramp per track colour, the
 * seven-hue spectrum the hero wall runs left to right, and the single glow
 * colour per track that dots, tiles and the loader agree on. Every light on
 * the page (the hero wall, the pipe marks, the loader's streaks) reads from
 * here, so a colour change is one edit.
 */
export type Palette = { hot: string; hi: string; mid: string; lo: string };

export const PAL: Record<Exclude<TrackColor, "spectrum">, Palette> = {
  blue: { hot: "#EAF2FF", hi: "#8AB4F8", mid: "#4285F4", lo: "#1B49B8" },
  red: { hot: "#FFE9E6", hi: "#FF8A80", mid: "#EA4335", lo: "#9E1F17" },
  yellow: { hot: "#FFF8DD", hi: "#FFE082", mid: "#FBBC04", lo: "#B87800" },
  green: { hot: "#E6FAEC", hi: "#81C995", mid: "#34A853", lo: "#0F6B33" },
};

// Left to right across the hero wall.
export const SPECTRUM: Palette[] = [
  { hot: "#E6F4FF", hi: "#8AB4F8", mid: "#4285F4", lo: "#1B49B8" },
  { hot: "#E6FBFF", hi: "#7FE3FF", mid: "#33C6F5", lo: "#0B7FA8" },
  { hot: "#E6FAEC", hi: "#81C995", mid: "#34A853", lo: "#0F6B33" },
  { hot: "#F7FFE0", hi: "#D9F27A", mid: "#B5E000", lo: "#6E8A00" },
  { hot: "#FFF8DD", hi: "#FFE082", mid: "#FBBC04", lo: "#B87800" },
  { hot: "#FFEEDD", hi: "#FFB27A", mid: "#FF7A1A", lo: "#B24C00" },
  { hot: "#FFE9E6", hi: "#FF8A80", mid: "#EA4335", lo: "#9E1F17" },
];

export const GLOW: Record<TrackColor, string> = {
  blue: "#4285F4",
  red: "#EA4335",
  yellow: "#FBBC04",
  green: "#34A853",
  spectrum: "#34A853",
};
