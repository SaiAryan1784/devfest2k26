import { SPECTRUM } from "./slabs";

/**
 * The ident: the opening as one physical idea, a prism. Black. A soft seam
 * of white light comes up at the centre like a dimmer, swells once, and
 * disperses into vertical stripes in a single continuous expansion, every
 * stripe leaving together, the outer ones travelling further and settling
 * later. Colour comes from the separation: stripes stay near white at the
 * centre and take on their hue as they move away, blue one way, red the
 * other, two fainter layers behind for depth. Each stripe is a soft-edged
 * beam with bloom, its hot band riding one slow wave across the field. The
 * mark pulls into focus out of the light (the stage does that) while the
 * stripes behind it dim into a soft halo, as if the mark takes the light.
 * At the cut the field rushes past the camera and the black dissolves onto
 * the billboard's video, already playing.
 *
 * Reference, not copy: the Netflix ident's ribbon splitting into a spectrum
 * the camera flies through. Ours is also the site's story: one light, four
 * tracks.
 *
 * Pure drawing, no React. Canvas 2D on a transparent canvas over the gate's
 * black backdrop, DPR 1, no filters, no images: everything is light added
 * (`lighter`) from a handful of 1-D sprites blitted stretched, drawn in
 * passes so the canvas state changes a few times per frame, not per stripe.
 */

/** Front to back: stripe pitch, core width, first stripe's offset, brightness, and the share of the push each layer gets. */
export const PITCH = [30, 30, 22];
export const BAR_W = [12, 7, 4];
export const OFFSET = [0, 15, 7];
export const LAYER_ALPHA = [1, 0.42, 0.24];
export const LAYER_PUSH = [1, 0.55, 0.3];
/** Below this width the pitch and widths scale by NARROW_K. */
export const NARROW = 768;
export const NARROW_K = 0.6;
/** Drawn progress over which the seam of light comes up. */
export const SEAM: [number, number] = [0.02, 0.14];
/** Drawn progress over which the seam disperses into the stripes. */
export const SPLIT: [number, number] = [0.16, 0.5];
/** Drawn progress over which the two far layers come up. */
export const DEPTH: [number, number] = [0.3, 0.56];
/** The mark's focus pull, used by the stage; the halo behind it is drawn here. */
export const MARK: [number, number] = [0.52, 0.7];
/** The halo behind the mark: how far it reaches (as a multiple of the base
 *  0.42 * min(w,h) radius) and how dark it gets at centre and at its 45% stop.
 *  Raised so the mark reads as the clear focus of the frame, not one bright
 *  thing among many stripes. */
export const HALO_REACH = 1.35;
export const HALO_DARK: [number, number] = [0.88, 0.62];
/** Distance from the centre (0..1 of half the width) by which a front stripe is fully in its hue. */
export const SAT_D = 0.55;
/** Extra scale reached by the end of the hold (the camera starting to move), and the scale the rush reaches during the cut. */
export const HOLD_PUSH = 0.12;
export const CUT_PUSH = 7;
export const RUSH_S = 0.9;
/** The field dissolves between these two moments of the cut, in seconds. */
export const FADE_S: [number, number] = [0.3, 0.9];
/** Hot band height as a fraction of the canvas, and the wave it rides: amplitude (of the height), cycles across the width, speed. */
export const BAND_H = 0.26;
export const WAVE = { amp: 0.1, cycles: 1.15, speed: 0.2 };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
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
  /** Distance from the centre, 0..1 of half the width. */
  d: number;
  /** How far into its hue the stripe goes; the centre stays white. */
  sat: number;
  /** Ease exponent of its dispersion: inner stripes settle first. */
  k: number;
  seed: number;
};

export type Sprites = { body: HTMLCanvasElement[]; bloom: HTMLCanvasElement[]; band: HTMLCanvasElement[]; white: HTMLCanvasElement; whiteBand: HTMLCanvasElement; seam: HTMLCanvasElement };
export type Field = { bars: Bar[]; sprites: Sprites; scratch: Float32Array };

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

function strip(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) paint(g);
  return c;
}

/** A horizontal profile: soft shoulders, flat core. The beam. */
function bodySprite(rgb: string) {
  return strip(64, 1, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, rgba(rgb, 0));
    grad.addColorStop(0.18, rgba(rgb, 0.8));
    grad.addColorStop(0.34, rgba(rgb, 1));
    grad.addColorStop(0.66, rgba(rgb, 1));
    grad.addColorStop(0.82, rgba(rgb, 0.8));
    grad.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 1);
  });
}
/** A horizontal gaussian-ish falloff. The bloom around a beam, and the seam's glow. */
function bloomSprite(rgb: string) {
  return strip(64, 1, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, rgba(rgb, 0));
    grad.addColorStop(0.25, rgba(rgb, 0.12));
    grad.addColorStop(0.5, rgba(rgb, 1));
    grad.addColorStop(0.75, rgba(rgb, 0.12));
    grad.addColorStop(1, rgba(rgb, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 1);
  });
}
/** A vertical profile: the hot band, hot at the centre falling to the hue. */
function bandSprite(mid: string, hot: string) {
  return strip(1, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, rgba(mid, 0));
    grad.addColorStop(0.3, rgba(mid, 0.6));
    grad.addColorStop(0.5, rgba(hot, 1));
    grad.addColorStop(0.7, rgba(mid, 0.6));
    grad.addColorStop(1, rgba(mid, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 1, 256);
  });
}

function sprites(): Sprites {
  const white = "255,255,255";
  return {
    body: SPECTRUM.map((p) => bodySprite(hexRgb(p.mid))),
    bloom: SPECTRUM.map((p) => bloomSprite(hexRgb(p.hi))),
    band: SPECTRUM.map((p) => bandSprite(hexRgb(p.mid), hexRgb(p.hot))),
    white: bodySprite(white),
    whiteBand: bandSprite("230,236,255", white),
    seam: bloomSprite(white),
  };
}

/** Lay the stripes out for a canvas of this size. */
export function buildField(w: number, h: number): Field {
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
        d,
        sat: layer === 0 ? Math.min(1, d / SAT_D) : 1,
        k: 4.6 - 1.8 * d + rnd() * 0.3,
        seed: rnd() * Math.PI * 2,
      });
    }
  }
  void h;
  return { bars, sprites: sprites(), scratch: new Float32Array(bars.length * 5) };
}

export type FieldState = {
  /** Drawn progress, 0..1. */
  p: number;
  /** Seconds into the cut, or a negative number before it. */
  since: number;
  t: number;
};

export function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, field: Field, s: FieldState) {
  const { p, since, t } = s;
  const cx = w / 2;
  const cy = h / 2;
  const cut = since >= 0;
  const holdZ = 1 + HOLD_PUSH * smooth(0.72, 1, p);
  const z0 = cut ? holdZ + (CUT_PUSH - holdZ) * easeIn(Math.min(1, since / RUSH_S)) : holdZ;
  const fade = cut ? 1 - smooth(FADE_S[0], FADE_S[1], since) : 1;
  const flare = cut ? 1 + 0.9 * smooth(0, 0.35, since) : 1;
  const split = smooth(SPLIT[0], SPLIT[1], p);
  const splitT = Math.min(1, Math.max(0, (p - SPLIT[0]) / (SPLIT[1] - SPLIT[0])));
  const bandH = BAND_H * h;
  const { bars, scratch: sc, sprites: sp } = field;
  const zs = [1 + (z0 - 1) * LAYER_PUSH[0], 1 + (z0 - 1) * LAYER_PUSH[1], 1 + (z0 - 1) * LAYER_PUSH[2]];
  const layerIn = [1, smooth(DEPTH[0], DEPTH[1], p), smooth(DEPTH[0] + 0.06, DEPTH[1] + 0.06, p)];
  // The stripes take their light from the seam as they leave it.
  const arrive = smooth(0, 0.18, splitT);

  ctx.clearRect(0, 0, w, h);
  if (fade <= 0) return;
  ctx.globalCompositeOperation = "lighter";

  // Pass 0: geometry. Per stripe: drawn flag, x, w, alpha, band y.
  for (let i = 0; i < bars.length; i += 1) {
    const b = bars[i];
    const o = i * 5;
    sc[o] = 0;
    const base = LAYER_ALPHA[b.layer] * layerIn[b.layer] * arrive * fade;
    if (base <= 0.003 || split <= 0) continue;
    const z = zs[b.layer];
    // Dispersion: everyone leaves together; the inner stripes settle first, the outer ones travel on.
    const e = 1 - (1 - splitT) ** b.k;
    const xs = cx + (b.x - cx) * e * z;
    const ws = Math.max(1, b.w * lerp(0.7, 1, e) * Math.sqrt(z));
    if (xs + 2 * ws < 0 || xs - 2 * ws > w) continue;
    // A slow breath travelling across the field.
    const breath = 1 + 0.08 * Math.sin(t * 0.7 - (b.x / w) * 4 + b.seed * 0.2);
    sc[o] = 1;
    sc[o + 1] = xs;
    sc[o + 2] = ws;
    sc[o + 3] = Math.min(1, base * breath);
    sc[o + 4] = cy + WAVE.amp * h * Math.sin((b.x / w) * Math.PI * 2 * WAVE.cycles - t * WAVE.speed * Math.PI * 2 + b.layer * 0.9) + 0.02 * h * Math.sin(t * 0.5 + b.seed);
  }

  // Pass 1: bloom around the front stripes.
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 5;
    if (sc[o] === 0 || bars[i].layer !== 0) continue;
    const b = bars[i];
    const ws = sc[o + 2] * 2.6;
    ctx.globalAlpha = 0.16 * sc[o + 3] * Math.min(1.6, flare);
    ctx.drawImage(b.sat < 1 ? sp.seam : sp.bloom[b.hue], sc[o + 1] - ws / 2, 0, ws, h);
  }

  // Pass 2: the beams. Hue by how far the stripe has moved from the centre; white where it has not.
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 5;
    if (sc[o] === 0) continue;
    const b = bars[i];
    const x0 = sc[o + 1] - sc[o + 2] / 2;
    const a = 0.38 * sc[o + 3] * Math.min(1.5, flare);
    if (b.sat > 0.003) {
      ctx.globalAlpha = a * b.sat;
      ctx.drawImage(sp.body[b.hue], x0, 0, sc[o + 2], h);
    }
    if (b.sat < 0.997) {
      ctx.globalAlpha = a * (1 - b.sat);
      ctx.drawImage(sp.white, x0, 0, sc[o + 2], h);
    }
  }

  // Pass 3: the hot bands, riding the wave.
  for (let i = 0; i < bars.length; i += 1) {
    const o = i * 5;
    if (sc[o] === 0) continue;
    const b = bars[i];
    const x0 = sc[o + 1] - sc[o + 2] / 2;
    const y0 = sc[o + 4] - bandH / 2;
    ctx.globalAlpha = Math.min(1, 0.85 * sc[o + 3] * Math.min(1.3, flare));
    ctx.drawImage(b.sat < 0.5 ? sp.whiteBand : sp.band[b.hue], x0, y0, sc[o + 2], bandH);
  }

  // The seam: comes up like a dimmer, swells once, and gives its light to the stripes.
  const seamUp = smooth(SEAM[0], SEAM[1], p);
  const swell = 1 + 0.6 * bump(SPLIT[0] - 0.06, SPLIT[0] + 0.05, p);
  const seamOut = 1 - smooth(SPLIT[0] + 0.02, SPLIT[0] + 0.16, p);
  const seamA = seamUp * swell * seamOut * fade;
  if (seamA > 0.003) {
    const glowW = lerp(24, 110, seamUp) * swell;
    ctx.globalAlpha = Math.min(1, 0.55 * seamA);
    ctx.drawImage(sp.seam, cx - glowW / 2, 0, glowW, h);
    ctx.globalAlpha = Math.min(1, 0.95 * seamA);
    ctx.drawImage(sp.white, cx - 3, 0, 6, h);
  }

  // The halo: the stripes behind the mark dim as it takes the light.
  const halo = smooth(MARK[0], MARK[1], p) * (cut ? 1 - smooth(0, 0.3, since) : 1);
  if (halo > 0.01) {
    const r = 0.42 * Math.min(w, h) * HALO_REACH;
    ctx.globalCompositeOperation = "source-over";
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(0,0,0,${(HALO_DARK[0] * halo).toFixed(3)})`);
    g.addColorStop(0.45, `rgba(0,0,0,${(HALO_DARK[1] * halo).toFixed(3)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
