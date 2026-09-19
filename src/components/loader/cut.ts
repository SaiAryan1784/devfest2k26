/** The cut, in seconds: the stripes rush past the camera and the black dissolves while the mark holds, then it glides to the billboard. */
export const CUT_S = 2.2;
/** Fraction of the cut at which the glide begins (about 1.0 s). Loader.tsx times finish() to it. */
export const GLIDE_AT = 0.45;
/** Where the loader's lockup has to travel to land on the hero's. */
export type Flip = { x: number; y: number; scale: number };
