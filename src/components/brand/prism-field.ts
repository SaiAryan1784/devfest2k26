import { BRACKET_L_BOX, BRACKET_R_BOX, LOCKUP_H, LOCKUP_W } from "./lockup-paths";
import { PAL } from "./slabs";

/**
 * The optical bench behind the whole opening: one white beam into the `{`,
 * four colours out of the `}`. Pure drawing, no React. The loader's canvas and
 * the hero's canvas both call `drawField` with the same state, so the frame
 * the loader leaves on and the frame the hero starts on are the same picture.
 *
 * Canvas 2D on a transparent canvas, additive compositing, no filters, no
 * images. Per frame: four conic-gradient wedges for the fan and one radial
 * erase for their falloff, three gradient rectangles for the white beam, an
 * internal glow, three flares, and up to 150 dust discs.
 */

export type Rect = { left: number; top: number; width: number };
export type Beams = [number, number, number, number];
export type Dust = { u: number; v: number; r: number; du: number; dv: number; phase: number };

/** Top to bottom of the fan: the site's own spectrum order. */
export const BEAM_ORDER = ["blue", "green", "yellow", "red"] as const;

/** Below this width the bench is the phone bench: steeper in, steeper out. */
export const NARROW = 768;
/** Rest angle of the white beam, degrees above the leftward horizontal. */
export const IN_REST: { wide: number; narrow: number } = { wide: 17, narrow: 40 };
/** Rest angle of the fan's centre, degrees below the rightward horizontal. */
export const OUT_REST: { wide: number; narrow: number } = { wide: 18, narrow: 50 };
/** Rest spread of the fan, degrees from the blue beam to the red. */
export const SPREAD_REST = 20;
/**
 * How far the pointer can steer the white beam. Kept flat so the beam always
 * enters from the left edge below the nav, never through its lockup.
 */
export const IN_MIN = 5;
export const IN_MAX = 22;
/** How much the fan swings per degree of beam swing: the fan does the travelling. */
export const FAN_FOLLOW = 2.2;
/** Overall brightness once the bench is behind the hero copy. */
export const HERO_DIM = 0.8;
/** Fan beam intensity at rest, when featured, and when another is featured. */
export const BEAM_REST = 0.6;
export const BEAM_FEATURED = 1;
export const BEAM_OTHERS = 0.3;
export const DUST = { wide: 150, narrow: 60 } as const;

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (x: number) => ((x % 1) + 1) % 1;
/** Small overshoot, for the fan opening. */
const backOut = (t: number) => {
  const s = 1.4;
  const u = t - 1;
  return 1 + u * u * ((s + 1) * u + s);
};

/**
 * A CSS cubic-bezier, solved here so the loader's canvas can follow the mark's
 * glide with the glide's own ease instead of reading layout every frame.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i += 1) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      if (e > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}
export const GLIDE_EASE = cubicBezier(0.16, 1, 0.3, 1);

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const rgba = (rgb: string, a: number) => `rgba(${rgb},${Math.min(1, Math.max(0, a)).toFixed(3)})`;
const WHITE = "255,255,255";
const RGB = {
  blue: { hi: hexRgb(PAL.blue.hi), mid: hexRgb(PAL.blue.mid) },
  green: { hi: hexRgb(PAL.green.hi), mid: hexRgb(PAL.green.mid) },
  yellow: { hi: hexRgb(PAL.yellow.hi), mid: hexRgb(PAL.yellow.mid), hot: hexRgb(PAL.yellow.hot) },
  red: { hi: hexRgb(PAL.red.hi), mid: hexRgb(PAL.red.mid) },
};

/** The four intensities for a given accent: even at rest, one featured otherwise. */
export function restBeams(accent: string): Beams {
  const i = (BEAM_ORDER as readonly string[]).indexOf(accent);
  if (i < 0) return [BEAM_REST, BEAM_REST, BEAM_REST, BEAM_REST];
  return BEAM_ORDER.map((_, k) => (k === i ? BEAM_FEATURED : BEAM_OTHERS)) as Beams;
}

/** Seeded, so both canvases scatter the same dust. Positions are fractions of the canvas. */
export function createDust(count: number, seed = 7): Dust[] {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    u: rnd(),
    v: rnd(),
    r: 0.8 + rnd() * 1.6,
    du: 0.003 + rnd() * 0.006,
    dv: -(0.001 + rnd() * 0.003),
    phase: rnd() * TAU,
  }));
}

export type Bench = { k: number; E: [number, number]; X: [number, number]; mid: [number, number]; h: number };

/** Entry point (centre of the `{`), exit point (centre of the `}`) and scale, from the mark's box. */
export function bench(rect: Rect): Bench {
  const k = rect.width / LOCKUP_W;
  const y = rect.top + (BRACKET_L_BOX.y + BRACKET_L_BOX.height / 2) * k;
  return {
    k,
    E: [rect.left + (BRACKET_L_BOX.x + BRACKET_L_BOX.width / 2) * k, y],
    X: [rect.left + (BRACKET_R_BOX.x + BRACKET_R_BOX.width / 2) * k, y],
    mid: [rect.left + rect.width / 2, rect.top + (LOCKUP_H / 2) * k],
    h: LOCKUP_H * k,
  };
}

/**
 * The beam angle the pointer asks for: the source is the pointer, mirrored to
 * the left of the entry point so the light always comes in from the left, and
 * clamped so it never lies flat or stands upright. Continuous everywhere.
 */
export function pointerAngle(cx: number, cy: number, E: [number, number]) {
  const deg = Math.atan2(E[1] - cy, Math.abs(cx - E[0])) / RAD;
  return Math.min(IN_MAX, Math.max(IN_MIN, deg));
}

/** Where the four track names sit in the loader: along the four beams, floating just above each, left anchored. */
export function labelAnchors(rect: Rect, w: number): [number, number][] {
  const { X } = bench(rect);
  const out = (w < NARROW ? OUT_REST.narrow : OUT_REST.wide) * RAD;
  const spread = SPREAD_REST * RAD;
  const d = Math.max(120, Math.min(340, w - X[0] - 190));
  const lift = 13;
  return BEAM_ORDER.map((_, i) => {
    const a = out + spread * (i / 3 - 0.5);
    return [X[0] + Math.cos(a) * d + Math.sin(a) * lift, X[1] + Math.sin(a) * d - Math.cos(a) * lift];
  });
}

export type FieldState = {
  rect: Rect;
  /** 0..1, how far the opening has got. 1 once the bench is behind the hero. */
  p: number;
  inAngle: number;
  outAngle: number;
  spread: number;
  beams: Beams;
  dim: number;
  t: number;
  dust: Dust[];
};

function flare(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, stops: [number, string][], sx = 1, sy = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, 2 * r, 2 * r);
  ctx.restore();
}

export function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, s: FieldState) {
  const { k, E, X, mid, h: lh } = bench(s.rect);
  const { p, t, dim } = s;
  const L = 2 * Math.max(w, h);
  const R = 0.95 * Math.max(w, h);
  const flick = 1 + 0.03 * Math.sin(t * 37) + 0.02 * Math.sin(t * 13.7);

  ctx.clearRect(0, 0, w, h);

  // The fan, first, so its falloff can be erased without touching anything else.
  // It leaves the `}` as one beam and opens into four, with a little overshoot.
  const fanLen = L * smooth(0.62, 0.8, p);
  const spread = s.spread * backOut(smooth(0.66, 0.86, p)) * RAD;
  const hw = Math.max(0.02, (spread / 3) * 0.9);
  const out = s.outAngle * RAD;
  const angles = [0, 1, 2, 3].map((i) => out + spread * (i / 3 - 0.5));
  if (fanLen > 0) {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i += 1) {
      const c = RGB[BEAM_ORDER[i]];
      const I = s.beams[i] * dim * (1 + 0.04 * Math.sin(t * 2.1 + i * 1.7));
      if (I <= 0.002) continue;
      const g = ctx.createConicGradient(angles[i] - hw, X[0], X[1]);
      const span = (2 * hw) / TAU;
      g.addColorStop(0, rgba(c.mid, 0));
      g.addColorStop(span * 0.15, rgba(c.mid, 0.12 * I));
      g.addColorStop(span * 0.38, rgba(c.mid, 0.4 * I));
      g.addColorStop(span * 0.5, rgba(c.hi, 0.8 * I));
      g.addColorStop(span * 0.62, rgba(c.mid, 0.4 * I));
      g.addColorStop(span * 0.85, rgba(c.mid, 0.12 * I));
      g.addColorStop(span, rgba(c.mid, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(X[0], X[1]);
      ctx.arc(X[0], X[1], fanLen, angles[i] - hw, angles[i] + hw);
      ctx.closePath();
      ctx.fill();
    }
    // Falloff with distance, so the colours dissolve into the dark.
    ctx.globalCompositeOperation = "destination-out";
    const fall = ctx.createRadialGradient(X[0], X[1], 0, X[0], X[1], R);
    fall.addColorStop(0, "rgba(0,0,0,0)");
    fall.addColorStop(0.12, "rgba(0,0,0,0)");
    fall.addColorStop(0.55, "rgba(0,0,0,0.6)");
    fall.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = fall;
    ctx.fillRect(0, 0, w, h);
  }

  // The white beam, from off screen into the `{`. Its head travels in during
  // the opening; after that it runs from the edge to the entry point.
  const th = s.inAngle * RAD;
  const dir: [number, number] = [-Math.cos(th), -Math.sin(th)];
  const sHead = smooth(0.1, 0.4, p);
  const headD = L * (1 - sHead);
  const head: [number, number] = [E[0] + dir[0] * headD, E[1] + dir[1] * headD];
  if (sHead > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.save();
    ctx.translate(E[0], E[1]);
    ctx.rotate(Math.atan2(dir[1], dir[0]));
    const layers: [number, number][] = [
      [44 * k, 0.09],
      [10 * k, 0.32],
      [1.5 + 0.5 * k, 0.95],
    ];
    for (const [width, alpha] of layers) {
      const g = ctx.createLinearGradient(0, -width / 2, 0, width / 2);
      g.addColorStop(0, rgba(WHITE, 0));
      g.addColorStop(0.5, rgba(WHITE, alpha * dim * flick));
      g.addColorStop(1, rgba(WHITE, 0));
      ctx.fillStyle = g;
      ctx.fillRect(headD, -width / 2, L - headD, width);
    }
    ctx.restore();
  }

  // Inside the mark: a blob of light travels from `{` to `}` during the
  // opening, and a faint band stays behind the wordmark so it reads lit.
  ctx.globalCompositeOperation = "lighter";
  const travel = smooth(0.4, 0.66, p);
  const band = smooth(0.42, 0.72, p);
  if (band > 0) {
    const a = 0.16 * band * dim;
    flare(ctx, mid[0], mid[1], lh * 0.55, [[0, rgba(WHITE, a)], [0.5, rgba(WHITE, a * 0.35)], [1, rgba(WHITE, 0)]], 2, 0.45);
  }
  if (travel > 0 && travel < 1) {
    const a = 0.5 * dim * Math.sin(travel * Math.PI);
    flare(ctx, lerp(E[0], X[0], travel), E[1], lh * 0.5, [[0, rgba(WHITE, a)], [0.5, rgba(WHITE, a * 0.35)], [1, rgba(WHITE, 0)]], 1.2, 1);
  }

  // Flares: the travelling head, the impact at the entry (with a bloom), the exit.
  const headOn = smooth(0.1, 0.14, p) * (1 - smooth(0.36, 0.42, p));
  if (headOn > 0) {
    flare(ctx, head[0], head[1], 30 * k, [[0, rgba(WHITE, 0.8 * dim * headOn)], [0.35, rgba(WHITE, 0.2 * dim * headOn)], [1, rgba(WHITE, 0)]]);
  }
  const impact = smooth(0.38, 0.42, p);
  if (impact > 0) {
    const bloom = 1 + 0.8 * Math.sin(Math.PI * smooth(0.4, 0.56, p));
    const breath = 1 + 0.05 * Math.sin(t * 1.3);
    flare(ctx, E[0], E[1], 48 * k * bloom * breath, [
      [0, rgba(WHITE, 0.95 * dim * impact)],
      [0.18, rgba(WHITE, 0.5 * dim * impact)],
      [0.42, rgba(RGB.blue.hi, 0.14 * dim * impact)],
      [1, rgba(WHITE, 0)],
    ]);
  }
  const exit = smooth(0.6, 0.66, p);
  if (exit > 0) {
    flare(ctx, X[0], X[1], 40 * k * (1 + 0.05 * Math.sin(t * 1.1 + 2)), [
      [0, rgba(RGB.yellow.hot, 0.85 * dim * exit)],
      [0.3, rgba(RGB.yellow.hi, 0.25 * dim * exit)],
      [1, rgba(RGB.yellow.hi, 0)],
    ]);
  }

  // Dust: lit only where a beam crosses it, in that beam's colour.
  const sigma = 14 * k;
  for (const d of s.dust) {
    const x = wrap(d.u + t * d.du) * w;
    const y = wrap(d.v + t * d.dv) * h;
    let lit = 0;
    let rgb = WHITE;
    if (sHead > 0) {
      const rx = x - head[0];
      const ry = y - head[1];
      if (rx * dir[0] + ry * dir[1] > 0) {
        const perp = Math.abs(rx * dir[1] - ry * dir[0]);
        lit += Math.exp(-(perp * perp) / (2 * sigma * sigma)) * flick;
      }
    }
    if (fanLen > 0) {
      const rx = x - X[0];
      const ry = y - X[1];
      const r = Math.hypot(rx, ry);
      if (r > 2 && r < fanLen) {
        const ang = Math.atan2(ry, rx);
        const fall = 1 - smooth(0.12 * R, R, r);
        let best = 0;
        for (let i = 0; i < 4; i += 1) {
          const da = Math.atan2(Math.sin(ang - angles[i]), Math.cos(ang - angles[i]));
          const across = da / hw;
          const li = s.beams[i] * Math.exp(-2 * across * across) * fall;
          lit += li;
          if (li > best) {
            best = li;
            if (li > 0.15) rgb = RGB[BEAM_ORDER[i]].hi;
          }
        }
      }
    }
    const tw = 0.5 + 0.5 * Math.sin(t * 1.7 + d.phase);
    const a = 0.035 * dim + lit * dim * (0.35 + 0.65 * tw);
    if (a < 0.01) continue;
    ctx.fillStyle = rgba(rgb, a);
    ctx.beginPath();
    ctx.arc(x, y, d.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
