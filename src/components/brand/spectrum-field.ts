import { BRACKET_L, BRACKET_R, CAPSULE, LOCKUP_H, LOCKUP_W, WORDMARK } from "./lockup-paths";
import { SPECTRUM } from "./slabs";

/**
 * The shelf: the opening drawn as vertical bars of light. Thin white lines
 * sweep in from both edges and stop at their column of the mark, lighting
 * only the rows the mark occupies there, so the lockup builds up as a barcode
 * of light. Then the bars extend to full height, take the site's spectrum as
 * dark glass with a hot band, two denser layers appear behind, and the whole
 * field is pushed past the camera into the page.
 *
 * Pure drawing, no React. Canvas 2D on a transparent canvas, no filters, no
 * images: per bar a fill or two and one sprite blit for the band.
 */

export type Rect = { left: number; top: number; width: number };
export type Run = [number, number];

/** Front to back: pixels per bar, bar width, brightness, and the share of the push each layer gets. */
export const PITCH = [7, 8, 10];
export const BAR_W = [4.5, 2.5, 1.5];
export const LAYER_ALPHA = [1, 0.4, 0.22];
export const LAYER_PUSH = [1, 0.55, 0.3];
/** Extra scale reached by the end of the hold, and the scale the rush reaches during the cut. */
export const HOLD_PUSH = 0.6;
export const CUT_PUSH = 7;
export const RUSH_S = 0.9;
/** The field dissolves between these two moments of the cut, in seconds. */
export const FADE_S: [number, number] = [0.15, 0.7];
/** Hot band height as a fraction of the canvas. */
export const BAND_H = 0.22;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;
/** A bump that rises and falls between a and b. */
const bump = (a: number, b: number, x: number) => Math.sin(Math.PI * smooth(a, b, x));

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const rgba = (rgb: string, a: number) => `rgba(${rgb},${Math.min(1, Math.max(0, a)).toFixed(3)})`;

export type Bar = {
  x: number;
  w: number;
  layer: number;
  hue: number;
  /** Drawn progress at which the line has arrived at its column. */
  arrive: number;
  fromLeft: boolean;
  /** Drawn progress at which the bar starts extending to full height. */
  extendAt: number;
  /** Where the hot band rests, as a fraction of the height. */
  band: number;
  seed: number;
  /** The rows of the mark this column lights, in canvas y. Front layer only. */
  runs: Run[];
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
  if (!g) return columns.map(() => []);
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

/** Lay the bars out for a canvas of this size around the mark's box. */
export function buildField(w: number, h: number, rect: Rect): Field {
  const rnd = prng(11);
  const cx = w / 2;
  const bars: Bar[] = [];
  for (let layer = 0; layer < 3; layer += 1) {
    const pitch = PITCH[layer];
    const offset = layer * pitch * 0.5;
    const n = Math.ceil(w / pitch) + 1;
    for (let i = 0; i < n; i += 1) {
      const x = offset + i * pitch;
      const d = Math.min(1, Math.abs(x - cx) / cx);
      bars.push({
        x,
        w: BAR_W[layer],
        layer,
        hue: Math.min(SPECTRUM.length - 1, Math.floor((x / w) * SPECTRUM.length)),
        arrive: 0.1 + 0.3 * (1 - d) + rnd() * 0.03,
        fromLeft: x < cx,
        extendAt: 0.55 + 0.09 * d + rnd() * 0.03,
        band: 0.28 + 0.44 * rnd(),
        seed: rnd() * Math.PI * 2,
        runs: [],
      });
    }
  }
  const front = bars.filter((b) => b.layer === 0);
  const runs = silhouette(rect, front.map((b) => b.x + b.w / 2));
  front.forEach((b, i) => {
    b.runs = runs[i];
  });
  return { bars, sprites: bandSprites(), lo: SPECTRUM.map((p) => p.lo), scratch: new Float32Array(bars.length * 8) };
}

export type FieldState = {
  /** Drawn progress, 0..1. */
  p: number;
  /** Seconds into the cut, or a negative number before it. */
  since: number;
  t: number;
};

/**
 * Drawn in passes so the canvas state changes a handful of times per frame
 * instead of once per bar: first every bar's geometry and alphas are computed
 * into a scratch array, then the dark glass bodies (source-over), then every
 * white line, run and hot band (lighter), then the specular edges. Alpha goes
 * through `globalAlpha`, so no colour strings are built per frame.
 */
export function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, field: Field, s: FieldState) {
  const { p, since, t } = s;
  const cx = w / 2;
  const cut = since >= 0;
  const holdZ = 1 + HOLD_PUSH * smooth(0.8, 1, p);
  const z0 = cut ? holdZ + (CUT_PUSH - holdZ) * easeIn(Math.min(1, since / RUSH_S)) : holdZ;
  const fade = cut ? 1 - smooth(FADE_S[0], FADE_S[1], since) : 1;
  const bright = (1 + 0.4 * smooth(0.8, 1, p)) * (1 + 0.6 * bump(0.42, 0.52, p));
  const bandH = BAND_H * h;
  const { bars, scratch: sc } = field;

  ctx.clearRect(0, 0, w, h);
  if (fade <= 0) return;

  // Pass 0: geometry and alphas. Per bar: kind, x, w, top, bottom, white alpha, glass alpha, runs alpha.
  // kind 0 = skip, 1 = travelling line, 2 = arrived (runs or ghost), 3 = extended.
  const zs = [1 + (z0 - 1) * LAYER_PUSH[0], 1 + (z0 - 1) * LAYER_PUSH[1], 1 + (z0 - 1) * LAYER_PUSH[2]];
  const layerIn = [1, smooth(0.62, 0.8, p), smooth(0.68, 0.8, p)];
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    const o = i * 8;
    sc[o] = 0;
    const z = zs[b.layer];
    const base = LAYER_ALPHA[b.layer] * layerIn[b.layer] * fade;
    if (base <= 0.003) continue;
    const xs = cx + (b.x - cx) * z;
    const ws = Math.max(1, b.w * z);
    if (xs + ws < 0 || xs > w) continue;
    const e = smooth(b.extendAt, b.extendAt + 0.18, p);

    if (b.layer > 0) {
      if (e <= 0) continue;
      sc[o] = 3;
      sc[o + 1] = xs;
      sc[o + 2] = ws;
      sc[o + 3] = lerp(h * 0.5, 0, e);
      sc[o + 4] = lerp(h * 0.5, h, e);
      sc[o + 5] = 0;
      sc[o + 6] = Math.min(1, base * Math.min(1, bright));
      sc[o + 7] = 0;
      continue;
    }

    const a = smooth(b.arrive - 0.12, b.arrive, p);
    if (a <= 0) continue;
    if (a < 1) {
      const startX = b.fromLeft ? -12 : w + 12;
      sc[o] = 1;
      sc[o + 1] = cx + (lerp(startX, b.x, easeOut(a)) - cx) * z;
      sc[o + 5] = 0.35 * base;
      continue;
    }
    const q = smooth(0, 0.3, e);
    sc[o] = e > 0 ? 3 : 2;
    sc[o + 1] = xs;
    sc[o + 2] = ws;
    sc[o + 7] = base * (1 - q) * (b.runs.length ? Math.min(1, 0.95 * bright) : 0.08);
    if (e > 0) {
      const y0 = b.runs.length ? b.runs[0][0] : h * 0.5;
      const y1 = b.runs.length ? b.runs[b.runs.length - 1][1] : h * 0.5;
      const c = smooth(0.1, 0.8, e);
      sc[o + 3] = lerp(y0, 0, e);
      sc[o + 4] = lerp(y1, h, e);
      sc[o + 5] = Math.min(1, 0.9 * bright) * base * q * (1 - c);
      sc[o + 6] = Math.min(1, base * q * c * Math.min(1.4, bright));
    }
  }

  // Pass 1: dark glass bodies.
  ctx.globalCompositeOperation = "source-over";
  let hue = -1;
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 8;
    if (sc[o] !== 3 || sc[o + 6] <= 0.003) continue;
    const b = bars[i];
    if (b.hue !== hue) {
      hue = b.hue;
      ctx.fillStyle = field.lo[hue];
    }
    ctx.globalAlpha = 0.36 * sc[o + 6];
    ctx.fillRect(sc[o + 1], sc[o + 3], sc[o + 2], sc[o + 4] - sc[o + 3]);
  }

  // Pass 2: everything white, additive.
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 8;
    const kind = sc[o];
    if (kind === 0) continue;
    const b = bars[i];
    if (kind === 1) {
      ctx.globalAlpha = sc[o + 5];
      ctx.fillRect(sc[o + 1], 0, 1.5, h);
      continue;
    }
    if (sc[o + 7] > 0.003) {
      ctx.globalAlpha = Math.min(1, sc[o + 7]);
      if (b.runs.length) for (const [y0, y1] of b.runs) ctx.fillRect(sc[o + 1], y0, sc[o + 2], y1 - y0);
      else ctx.fillRect(sc[o + 1], 0, 1, h);
    }
    if (kind === 3 && sc[o + 5] > 0.003) {
      ctx.globalAlpha = sc[o + 5];
      ctx.fillRect(sc[o + 1], sc[o + 3], sc[o + 2], sc[o + 4] - sc[o + 3]);
    }
  }

  // Pass 3: the hot bands, one stretched blit each, clipped to the bar's extent by arithmetic.
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 8;
    if (sc[o] !== 3 || sc[o + 6] <= 0.003) continue;
    const b = bars[i];
    const bandY = b.band * h + 0.03 * h * Math.sin(t * 0.7 + b.seed);
    const bt = bandY - bandH / 2;
    const vt = Math.max(sc[o + 3], bt);
    const vb = Math.min(sc[o + 4], bandY + bandH / 2);
    if (vb <= vt) continue;
    ctx.globalAlpha = sc[o + 6];
    ctx.drawImage(field.sprites[b.hue], 0, ((vt - bt) / bandH) * 256, 1, ((vb - vt) / bandH) * 256, sc[o + 1], vt, sc[o + 2], vb - vt);
  }

  // Pass 4: specular edges on the front layer.
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 8;
    if (sc[o] !== 3 || bars[i].layer !== 0 || sc[o + 6] <= 0.003) continue;
    ctx.globalAlpha = 0.22 * sc[o + 6];
    ctx.fillRect(sc[o + 1], sc[o + 3], 1, sc[o + 4] - sc[o + 3]);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
