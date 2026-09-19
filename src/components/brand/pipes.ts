/**
 * The brand's "light pipe" marks, drawn in code. Every cell on the Figma glyph
 * sheet is the same object as the hero bars: a bundle of parallel light tubes
 * bent into a shape. These are the base paths, one per shape, in a 100×100 box,
 * stroke geometry only. `LightPipe` draws the tubes along them.
 *
 * Tracks use s-wave, arc, x and cross; the Floor uses the other nine, so no two
 * sections share a shape.
 */
export const PIPES = {
  /** A diagonal S from bottom-left to top-right. */
  "s-wave": "M12 70C38 70 62 30 88 30",
  /** A quarter arc bulging up and left. */
  arc: "M18 82A64 64 0 0 1 82 18",
  x: "M22 22L78 78M78 22L22 78",
  cross: "M50 18V82M18 50H82",
  arch: "M22 84V52A28 28 0 0 1 78 52V84",
  ring: "M18 50a32 32 0 1 0 64 0a32 32 0 1 0-64 0",
  square: "M30 20H70A10 10 0 0 1 80 30V70A10 10 0 0 1 70 80H30A10 10 0 0 1 20 70V30A10 10 0 0 1 30 20Z",
  chevron: "M20 32L50 62L80 32",
  /** One full sine across the box. */
  wave: "M12 50C26 24 38 24 50 50S74 76 88 50",
  /** A rounded corner: up, then right. */
  corner: "M20 80V40A20 20 0 0 1 40 20H80",
  hexagon: "M50 16L79 33V67L50 84L21 67V33Z",
  /** A Y fork. */
  fork: "M50 84V52M50 52L26 22M50 52L74 22",
  diamond: "M50 16L84 50L50 84L16 50Z",
} as const;

export type PipeShape = keyof typeof PIPES;
