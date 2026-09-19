/** The cut, in seconds: the mark holds at the centre, then glides up to the hero. */
export const CUT_S = 1.5;
/** Fraction of the cut at which the glide begins (0.6 s). Loader.tsx times finish() to it. */
export const GLIDE_AT = 0.4;
/** The glide itself, in seconds: the rest of the cut. */
export const GLIDE_S = CUT_S * (1 - GLIDE_AT);
/** Where the loader's lockup has to travel to land on the hero's. */
export type Flip = { x: number; y: number; scale: number };
