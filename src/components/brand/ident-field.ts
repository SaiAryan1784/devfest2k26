import { BRACKET_L, BRACKET_R, CAPSULE, LOCKUP_H, LOCKUP_W, WORDMARK } from "./lockup-paths";
import { SPECTRUM } from "./slabs";

/**
 * The ident: the opening as the Netflix title card, taken as a reference
 * rather than copied. Black. One line of light draws down the centre, then
 * splits into a spectrum of vertical stripes that fan outward like records
 * on a shelf, two fainter layers behind them for depth. The stripes are dark
 * glass in the site's spectrum by x, each with a hot band drifting in it and
 * a hairline of white at its edge. Where the stripes cross the mark, they
 * light up in the rows the mark occupies, left to right, so the lockup builds
 * as a barcode of light before the real one sharpens over it. At the cut the
 * whole field is pushed past the camera while the black behind it dissolves,
 * so the stripes fly out over the billboard's video, already playing.
 *
 * Pure drawing, no React. Canvas 2D on a transparent canvas over the gate's
 * black backdrop, DPR 1, no filters, no images. Drawn in passes so the canvas
 * state changes a handful of times per frame, not once per stripe.
 */

export type Rect = { left: number; top: number; width: number };
export type Run = [number, number];

/** Front to back: stripe pitch, stripe width, first stripe's offset, brightness, and the share of the push each layer gets. */
export const PITCH = [30, 30, 22];
export const BAR_W = [12, 6, 3];
export const OFFSET = [0, 15, 7];
export const LAYER_ALPHA = [1, 0.45, 0.25];
export const LAYER_PUSH = [1, 0.55, 0.3];
/** Below this width the pitch and widths scale by NARROW_K. */
export const NARROW = 768;
export const NARROW_K = 0.6;
/** Drawn progress over which the centre line draws down the screen. */
export const FIRST: [number, number] = [0.02, 0.12];
/** Drawn progress over which the front stripes leave the centre line, nearest first. */
export const FAN: [number, number] = [0.1, 0.45];
/** Drawn progress one stripe takes to slide to its rest. */
export const SLIDE = 0.14;
/** Drawn progress over which the two far layers come up. */
export const DEPTH: [number, number] = [0.3, 0.5];
/** Drawn progress over which the mark's rows light up in the stripes, left to right. */
export const BUILD: [number, number] = [0.45, 0.62];
/** The mark's fade, used by the stage; the barcode rows hand over to it here. */
export const MARK: [number, number] = [0.58, 0.72];
/** Extra scale reached by the end of the hold (the camera starting to move), and the scale the rush reaches during the cut. */
export const HOLD_PUSH = 0.15;
export const CUT_PUSH = 7;
export const RUSH_S = 0.9;
/** The field dissolves between these two moments of the cut, in seconds. */
export const FADE_S: [number, number] = [0.3, 0.9];
/** Hot band height as a fraction of the canvas. */
export const BAND_H = 0.22;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;
const easeIn = (t: number) => t * t * t;
/** A bump that rises and falls between a and b. */
const bump = (a: number, b: number, x: number) => Math.sin(Math.PI * smooth(a, b, x));

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const rgba = (rgb: string, a: number) => `rgba(${rgb},${Math.min(1, Math.max(0, a)).toFixed(3)})`;

export type Bar = {
  /** Resting centre x. */
  x: number;
  w: number;
  layer: number;
  hue: number;
  /** Drawn progress at which the stripe starts to leave the centre. */
  arrive: number;
  /** Where the hot band rests, as a fraction of the height. */
  band: number;
  seed: number;
  /** Drawn progress at which this column of the mark lights up. Front layer only, -1 elsewhere. */
  buildAt: number;
  /** The rows of the mark this column lights, in canvas y. Front layer only. */
  runs: Run[];
  /** Width of the lit rows: the pitch less a hairline, so the barcode reads as the mark's silhouette. */
  runW: number;
};

export type Field = { bars: Bar[]; sprites: HTMLCanvasElement[]; lo: string[]; scratch: Float32Array };

/** Seeded, so a rebuild on resize keeps the same picture. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rasterise the mark once at its on-screen size and read, for each column
 * asked for, the runs of rows it covers. Same paths the static Lockup draws.
 */
function silhouette(rect: Rect, columns: number[]): Run[][] {
  const k = rect.width / LOCKUP_W;
  const W = Math.ceil(rect.width);
  const H = Math.ceil(LOCKUP_H * k);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g || W < 1 || H < 1) return columns.map(() => []);
  g.scale(k, k);
  g.fillStyle = "#fff";
  for (const d of [BRACKET_L, BRACKET_R, ...WORDMARK]) g.fill(new Path2D(d));
  g.beginPath();
  g.roundRect(CAPSULE.x, CAPSULE.y, CAPSULE.width, CAPSULE.height, CAPSULE.rx);
  g.fill();
  const data = g.getImageData(0, 0, W, H).data;
  return columns.map((cx) => {
    const x = Math.round(cx - rect.left);
    if (x < 0 || x >= W) return [];
    const runs: Run[] = [];
    let start = -1;
    for (let y = 0; y < H; y += 1) {
      const on = data[(y * W + x) * 4 + 3] > 128;
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        runs.push([rect.top + start, rect.top + y]);
        start = -1;
      }
    }
    if (start >= 0) runs.push([rect.top + start, rect.top + H]);
    return runs;
  });
}

/** One 1×256 sprite per hue: the hot band's vertical profile, blitted stretched. */
function bandSprites(): HTMLCanvasElement[] {
  return SPECTRUM.map((p) => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 256;
    const g = c.getContext("2d");
    if (!g) return c;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, rgba(hexRgb(p.mid), 0));
    grad.addColorStop(0.32, rgba(hexRgb(p.mid), 0.75));
    grad.addColorStop(0.5, rgba(hexRgb(p.hot), 1));
    grad.addColorStop(0.68, rgba(hexRgb(p.mid), 0.75));
    grad.addColorStop(1, rgba(hexRgb(p.mid), 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, 256);
    return c;
  });
}

/** Lay the stripes out for a canvas of this size around the mark's box. */
export function buildField(w: number, h: number, rect: Rect): Field {
  const rnd = prng(11);
  const cx = w / 2;
  const k = w < NARROW ? NARROW_K : 1;
  const bars: Bar[] = [];
  for (let layer = 0; layer < 3; layer += 1) {
    const pitch = PITCH[layer] * k;
    const n = Math.ceil(w / pitch) + 1;
    for (let i = 0; i < n; i += 1) {
      const x = OFFSET[layer] * k + i * pitch;
      const d = Math.min(1, Math.abs(x - cx) / cx);
      bars.push({
        x,
        w: BAR_W[layer] * k,
        layer,
        hue: Math.min(SPECTRUM.length - 1, Math.max(0, Math.floor((x / w) * SPECTRUM.length))),
        arrive: FAN[0] + (FAN[1] - FAN[0] - SLIDE) * d + rnd() * 0.02,
        band: 0.28 + 0.44 * rnd(),
        seed: rnd() * Math.PI * 2,
        buildAt: -1,
        runs: [],
        runW: pitch - 2,
      });
    }
  }
  const front = bars.filter((b) => b.layer === 0 && b.x >= rect.left && b.x <= rect.left + rect.width);
  const runs = silhouette(rect, front.map((b) => b.x));
  const span = BUILD[1] - BUILD[0] - 0.06;
  front.forEach((b, i) => {
    b.runs = runs[i];
    b.buildAt = BUILD[0] + span * ((b.x - rect.left) / Math.max(1, rect.width));
  });
  void h;
  return { bars, sprites: bandSprites(), lo: SPECTRUM.map((p) => p.lo), scratch: new Float32Array(bars.length * 6) };
}

export type FieldState = {
  /** Drawn progress, 0..1. */
  p: number;
  /** Seconds into the cut, or a negative number before it. */
  since: number;
  t: number;
};

/**
 * Passes: geometry and alphas into a scratch array; the dark glass bodies
 * (source-over, grouped by hue); then everything that adds light (lighter):
 * the edges, the mark's rows, the hot bands, the centre line and the glow
 * behind the mark. Alpha goes through `globalAlpha`, so no colour strings are
 * built per frame.
 */
export function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, field: Field, s: FieldState) {
  const { p, since, t } = s;
  const cx = w / 2;
  const cy = h / 2;
  const cut = since >= 0;
  const holdZ = 1 + HOLD_PUSH * smooth(0.75, 1, p);
  const z0 = cut ? holdZ + (CUT_PUSH - holdZ) * easeIn(Math.min(1, since / RUSH_S)) : holdZ;
  const fade = cut ? 1 - smooth(FADE_S[0], FADE_S[1], since) : 1;
  // The dark bodies clear ahead of the light, so nothing muddy lingers over the video as the stripes fly out.
  const fadeBody = cut ? 1 - smooth(FADE_S[0] - 0.15, FADE_S[1] - 0.3, since) : 1;
  const bright = (1 + 0.35 * smooth(0.8, 1, p)) * (1 + 0.5 * bump(BUILD[0], BUILD[1] + 0.05, p)) * (cut ? 1 + 0.8 * smooth(0, 0.35, since) : 1);
  const bandH = BAND_H * h;
  const { bars, scratch: sc } = field;
  const zs = [1 + (z0 - 1) * LAYER_PUSH[0], 1 + (z0 - 1) * LAYER_PUSH[1], 1 + (z0 - 1) * LAYER_PUSH[2]];
  const layerIn = [1, smooth(DEPTH[0], DEPTH[1], p), smooth(DEPTH[0] + 0.06, DEPTH[1] + 0.06, p)];
  // The barcode rows hand over to the real mark as it sharpens.
  const rowsOut = 1 - smooth(MARK[0] + 0.04, MARK[1] + 0.04, p);

  ctx.clearRect(0, 0, w, h);
  if (fade <= 0) return;

  // Pass 0: geometry. Per stripe: drawn flag, x, w, alpha, rows alpha, spare.
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    const o = i * 6;
    sc[o] = 0;
    const base = LAYER_ALPHA[b.layer] * layerIn[b.layer] * fade;
    if (base <= 0.003) continue;
    const a = smooth(b.arrive, b.arrive + SLIDE, p);
    if (a <= 0) continue;
    const e = easeOutQuint(a);
    const z = zs[b.layer];
    const xs = cx + (b.x - cx) * e * z;
    const ws = Math.max(1, b.w * lerp(0.5, 1, e) * Math.sqrt(z));
    if (xs + ws < 0 || xs - ws > w) continue;
    sc[o] = 1;
    sc[o + 1] = xs - ws / 2;
    sc[o + 2] = ws;
    sc[o + 3] = Math.min(1, base * Math.min(1, a * 2));
    sc[o + 4] = b.buildAt < 0 ? 0 : smooth(b.buildAt, b.buildAt + 0.06, p) * rowsOut * fade;
  }

  // Pass 1: dark glass bodies, grouped by hue.
  ctx.globalCompositeOperation = "source-over";
  let hue = -1;
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 6;
    if (sc[o] === 0) continue;
    const b = bars[i];
    if (b.hue !== hue) {
      hue = b.hue;
      ctx.fillStyle = field.lo[hue];
    }
    ctx.globalAlpha = Math.min(1, 0.4 * sc[o + 3] * fadeBody * Math.min(1.5, bright));
    ctx.fillRect(sc[o + 1], 0, sc[o + 2], h);
  }

  // Pass 2: everything that adds light.
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 6;
    if (sc[o] === 0) continue;
    const b = bars[i];
    // A hairline of white at the left edge; the front layer's is brighter.
    ctx.globalAlpha = (b.layer === 0 ? 0.3 : 0.16) * sc[o + 3] * Math.min(1.4, bright);
    ctx.fillRect(sc[o + 1], 0, 1, h);
    // The mark's rows.
    if (sc[o + 4] > 0.003 && b.runs.length) {
      const rx = sc[o + 1] + sc[o + 2] / 2 - b.runW / 2;
      ctx.globalAlpha = Math.min(1, 0.95 * sc[o + 4]);
      for (const [y0, y1] of b.runs) ctx.fillRect(rx, y0, b.runW, y1 - y0);
      ctx.globalAlpha = 0.12 * sc[o + 4];
      ctx.fillRect(sc[o + 1], 0, sc[o + 2], h);
    }
  }
  // The hot bands, one stretched blit each.
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 6;
    if (sc[o] === 0) continue;
    const b = bars[i];
    const bandY = b.band * h + 0.03 * h * Math.sin(t * 0.7 + b.seed);
    ctx.globalAlpha = Math.min(1, sc[o + 3] * Math.min(1, bright));
    ctx.drawImage(field.sprites[b.hue], sc[o + 1], bandY - bandH / 2, sc[o + 2], bandH);
  }

  // The centre line: draws down from the middle, then hands over to the stripes as they leave it.
  const draw = smooth(FIRST[0], FIRST[1], p);
  const lineOut = 1 - smooth(FAN[0], FAN[0] + 0.1, p);
  if (draw > 0 && lineOut > 0.003) {
    const half = draw * (h / 2 + 0.02 * h);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.9 * lineOut * fade;
    ctx.fillRect(cx - 1, cy - half, 2, 2 * half);
    ctx.globalAlpha = 0.25 * lineOut * fade;
    ctx.fillRect(cx - 4, cy - half, 8, 2 * half);
  }

  // The glow behind the mark, rising with it and gone as the field rushes.
  const glow = smooth(MARK[0], MARK[1], p) * (cut ? 1 - smooth(0.2, 0.7, since) : 1);
  if (glow > 0.01) {
    const r = 0.3 * Math.min(w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${(0.16 * glow).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(255,255,255,${(0.05 * glow).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
