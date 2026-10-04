/*
 * Button styles shared by the admin console and the setup panel. Plain
 * elements (the shared Button uses `motion.*`, which throws under the /dgl
 * LazyMotion strict). `rounded-pill!` because the global :focus-visible rule
 * sets a 6 px radius and is unlayered. Disabled buttons use `aria-disabled`
 * (not `disabled`) so they stay focusable and a screen reader reaches the
 * reason linked by aria-describedby; their text is --color-muted on
 * near-black, well above AA.
 */
export const BTN = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill! font-medium transition-colors duration-200";
export const OFF = "cursor-not-allowed border border-hair bg-white/5 text-muted";
export const PRIMARY = "cursor-pointer bg-text text-[#0a0a0c] hover:bg-white";
export const DANGER = "cursor-pointer bg-red-lo text-white hover:brightness-110";
export const GHOST = "glass-pill cursor-pointer text-text hover:bg-white/10";
export const CAREFUL = "cursor-pointer border border-red-hi/60 bg-white/5 text-red-hi hover:bg-white/10";
export const ARMED = "ring-2 ring-yellow-hi ring-offset-2 ring-offset-canvas";
