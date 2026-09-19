import { SPECTRUM } from "./slabs";

/**
 * The frost: the opening as light through fogged glass. The whole screen is
 * frosted glass over the billboard's video, so the picture is glimpsed the
 * entire time, blurred and dimmed, people and stage lights moving behind the
 * fog. In front, the Netflix-style light stripes, thick and spaced: rods of
 * clearer glass that draw down the centre, fan outward like records on a
 * shelf, take a wave of light, and at the cut fly past the edges as the fog
 * clears into the real video.
 *
 * Pure drawing, no React. Canvas 2D, transparent, DPR 1, no filters, no
 * images, no backdrop-filter. The fog is the current video frame copied into
 * a small buffer and stretched back up in steps (a 9x upscale is a blur, for
 * free); each rod shows a finer copy of its own column, bent sideways, so
 * the rods read as glass that bends and clears the fog where they sit.
 *
 * Cost discipline, measured: a full-screen blit is the expensive unit, a
 * full-screen gradient fill costs more than one, and a bicubic full-screen
 * upscale costs five. So everything soft (the fog, its dimming and shading,
 * the light pass, the glow around each rod, the glow behind the mark) is
 * drawn into the 1/3-scale buffer and reaches the canvas in one bilinear
 * blit; only the rods' crisp bodies are drawn at full size.
 */

export type Rod = {
  /** Signed index from the centre rod (0), negative to the left. */
  k: number;
  /** Arrival order, 0 for the centre rod. */
  order: number;
  /** Resting centre x. */
  rest: number;
  /** Resting width. */
  w: number;
  hue: number;
  phase: number;
  /** Where the bright core rests, as a fraction of the height. */
  band: number;
  /** Drawn progress at which the rod starts to slide out from the centre. */
  arrive: number;
};
export type Sprites = { band: HTMLCanvasElement[]; glow: HTMLCanvasElement[]; pass: HTMLCanvasElement; tube: HTMLCanvasElement };
/** `geo` is per-frame scratch, six numbers per rod: drawn flag, x, width, top, height, light. */
export type Layout = { rods: Rod[]; base: number; readyAt: number; sprites: Sprites; shade: CanvasGradient | null; geo: Float32Array };
/** Offscreen canvases the size of the main one; the picture is drawn into their top-left corners at reduced scale. `mid` is the 1/FINE buffer everything soft is composed in. */
export type Buffers = { coarse: HTMLCanvasElement; mid: HTMLCanvasElement; fine: HTMLCanvasElement };

/** Base rod width, desktop and phone; each rod is 0.75 to 1.35 of it. */
export const ROD = { wide: 34, narrow: 18 };
/** Resting spacing as a multiple of the base width, jittered by 15 %. */
export const PITCH = { wide: 3.8, narrow: 3.4 };
export const NARROW = 768;
export const RADIUS = 6;
/** How far the rods run past the top and bottom, as a fraction of the height. */
export const BLEED = 0.04;
/** Drawn progress over which the fog rises out of black. */
export const RISE: [number, number] = [0, 0.1];
/** Drawn progress over which the centre rod draws down the screen and thickens. */
export const FIRST: [number, number] = [0.08, 0.22];
/** Drawn progress over which the other rods peel off the centre and fan out. */
export const FAN: [number, number] = [0.18, 0.56];
/** Drawn progress one rod takes to slide to its rest. */
export const SLIDE = 0.16;
/** The light pass, left to right. */
export const PASS: [number, number] = [0.56, 0.76];
/** The mark's fade, used by the stage; the glow behind it is drawn here. */
export const MARK: [number, number] = [0.62, 0.72];
/** Seconds into the cut by which the rods have flown past the edges. */
export const FLY_S = 1;
/** Seconds into the cut by which the fog has cleared into the picture. */
export const OPEN_S = 1.2;
/** Downscale of the fog at rest, by the end of the hold (it thins a little), and where the clearing stops: half resolution, so the last of the softness leaves with the canvas fade rather than costing a full-size copy per frame. */
export const FROST = 10;
export const FROST_HOLD = 7;
export const CLEAR = 2;
/** Downscale of the picture seen through a rod; also the one copy of the frame taken per frame, from which the fog is made. */
export const FINE = 3;
/** How far a rod bends the picture behind it, as a fraction of its width. */
export const REFRACT = 0.3;
/** How dark the fog is at rest. */
export const DIM = 0.5;
/** Sideways drift of a resting rod, in px. */
export const DRIFT = 4;
/** How far the rods are pushed past the camera by the end of the fly-through. */
export const Z_FLY = 7;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;
const easeIn = (t: number) => t * t * t;
const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const rgba = (rgb: string, a: number) => `rgba(${rgb},${Math.min(1, Math.max(0, a)).toFixed(3)})`;
const TINT = SPECTRUM.map((p) => `rgba(${hexRgb(p.mid)},0.08)`);
const HOT = SPECTRUM.map((p) => p.hot);

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

/** The sprites: one vertical core profile and one horizontal glow per hue, the white band of the light pass, and the specular that runs down a rod. All blitted stretched. */
function sprites(): Sprites {
  const band = SPECTRUM.map((p) =>
    strip(1, 256, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, rgba(hexRgb(p.hi), 0));
      grad.addColorStop(0.3, rgba(hexRgb(p.hi), 0.55));
      grad.addColorStop(0.5, rgba(hexRgb(p.hot), 1));
      grad.addColorStop(0.7, rgba(hexRgb(p.hi), 0.55));
      grad.addColorStop(1, rgba(hexRgb(p.hi), 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 1, 256);
    }),
  );
  const glow = SPECTRUM.map((p) =>
    strip(64, 1, (g) => {
      const grad = g.createLinearGradient(0, 0, 64, 0);
      grad.addColorStop(0, rgba(hexRgb(p.mid), 0));
      grad.addColorStop(0.5, rgba(hexRgb(p.mid), 1));
      grad.addColorStop(1, rgba(hexRgb(p.mid), 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 1);
    }),
  );
  const pass = strip(64, 1, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 1);
  });
  const tube = strip(64, 1, (g) => {
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.2, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.36, "rgba(255,255,255,1)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.25)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 1);
  });
  return { band, glow, pass, tube };
}

/** Lay the rods out for a canvas of this size: one at the centre, then outward on both sides with jittered widths and spacing. */
export function layout(w: number, h: number): Layout {
  const narrow = w < NARROW;
  const base = narrow ? ROD.narrow : ROD.wide;
  const pitch = base * (narrow ? PITCH.narrow : PITCH.wide);
  const rnd = prng(23);
  const cx = w / 2;
  const rods: Rod[] = [];
  const push = (k: number, rest: number, order: number) =>
    rods.push({
      k,
      order,
      rest,
      w: base * (0.75 + 0.6 * rnd()),
      hue: Math.min(SPECTRUM.length - 1, Math.max(0, Math.floor((rest / w) * SPECTRUM.length))),
      phase: rnd() * Math.PI * 2,
      band: 0.3 + 0.4 * rnd(),
      arrive: 0,
    });
  push(0, cx, 0);
  let order = 1;
  let xr = cx;
  let xl = cx;
  for (let k = 1; k < 200; k += 1) {
    xr += pitch * (0.85 + 0.3 * rnd());
    xl -= pitch * (0.85 + 0.3 * rnd());
    if (xr > w + base && xl < -base) break;
    if (xr <= w + base) push(k, xr, order++);
    if (xl >= -base) push(-k, xl, order++);
  }
  const total = rods.length;
  for (const r of rods) r.arrive = r.k === 0 ? FIRST[0] : FAN[0] + (FAN[1] - FAN[0]) * ((r.order - 1) / Math.max(1, total - 2));
  void h;
  return { rods, base, readyAt: -1, sprites: sprites(), shade: null, geo: new Float32Array(rods.length * 6) };
}

export type FieldState = {
  /** Drawn progress, 0..1. */
  p: number;
  /** Seconds into the cut, or a negative number before it. */
  since: number;
  t: number;
};

/**
 * The part of the frame `object-fit: cover` shows, drawn into a buffer's
 * corner at 1/f scale. Returns the drawn size.
 */
function sample(video: HTMLVideoElement, buf: HTMLCanvasElement, w: number, h: number, f: number): [number, number] {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.max(w / vw, h / vh);
  const cw = w / scale;
  const ch = h / scale;
  const sw = Math.max(1, Math.round(w / f));
  const sh = Math.max(1, Math.round(h / f));
  const g = buf.getContext("2d");
  if (g) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, sw, sh);
  }
  return [sw, sh];
}

export function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, video: HTMLVideoElement | null, bufs: Buffers, lay: Layout, s: FieldState) {
  const gm = bufs.mid.getContext("2d");
  if (!gm) return;
  const { p, since, t } = s;
  const cx = w / 2;
  const cy = h / 2;
  const cut = since >= 0;
  const openAll = cut ? easeInOut(smooth(0, OPEN_S, since)) : 0;
  const frost = 1 - openAll;
  const f = lerp(lerp(FROST, FROST_HOLD, smooth(0.75, 1, p)), CLEAR, openAll);
  const rise = smooth(RISE[0], RISE[1], p);
  const fly = cut ? easeIn(smooth(0, FLY_S, since)) : 0;
  const zf = 1 + (Z_FLY - 1) * fly;
  const rodAlpha = cut ? 1 - smooth(0.35, 0.9, since) : 1;
  const passT = smooth(PASS[0], PASS[1], p);
  const passX = lerp(-0.25 * w, 1.25 * w, passT);
  const { band, glow, pass, tube } = lay.sprites;
  const mw = Math.max(1, Math.round(w / FINE));
  const mh = Math.max(1, Math.round(h / FINE));

  const ready = Boolean(video && video.readyState >= 2 && video.videoWidth > 0);
  if (ready && lay.readyAt < 0) lay.readyAt = t;
  const reveal = ready ? smooth(0, 0.6, t - lay.readyAt) : 0;
  // While the fog is coarser than the small buffer it lives there with the
  // overlays; near the end of the clearing it is finer, goes straight onto
  // the canvas, and the buffer carries only the overlays, over transparency.
  const fogInMid = f > FINE;

  // Pass 1: the small buffer, drawn in canvas coordinates through a 1/3 transform.
  gm.setTransform(1, 0, 0, 1, 0, 0);
  gm.globalCompositeOperation = "source-over";
  gm.globalAlpha = 1;
  gm.imageSmoothingEnabled = true;
  gm.imageSmoothingQuality = "high";
  gm.clearRect(0, 0, mw, mh);
  gm.setTransform(1 / FINE, 0, 0, 1 / FINE, 0, 0);
  let fw = 0;
  let fh = 0;
  if (fogInMid) {
    gm.fillStyle = "#0b0b0f";
    gm.fillRect(0, 0, w, h);
    if (video && ready) {
      [fw, fh] = sample(video, bufs.fine, w, h, FINE);
      const sw = Math.max(1, Math.round(w / f));
      const sh = Math.max(1, Math.round(h / f));
      const gc = bufs.coarse.getContext("2d");
      if (gc) {
        gc.imageSmoothingEnabled = true;
        gc.imageSmoothingQuality = "high";
        gc.drawImage(bufs.fine, 0, 0, fw, fh, 0, 0, sw, sh);
      }
      gm.globalAlpha = reveal;
      gm.drawImage(bufs.coarse, 0, 0, sw, sh, 0, 0, w, h);
      gm.globalAlpha = 1;
    }
  }
  // Dim the fog, give it a milky cast, and shade the top and bottom for the captions.
  if (!lay.shade) {
    const g = gm.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0.7)");
    g.addColorStop(0.24, "rgba(0,0,0,0)");
    g.addColorStop(0.76, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.7)");
    lay.shade = g;
  }
  if (frost > 0.003) {
    gm.fillStyle = "#000000";
    gm.globalAlpha = DIM * frost;
    gm.fillRect(0, 0, w, h);
    gm.fillStyle = "rgba(214,224,255,0.05)";
    gm.globalAlpha = frost;
    gm.fillRect(0, 0, w, h);
    gm.fillStyle = lay.shade;
    gm.fillRect(0, 0, w, h);
    gm.globalAlpha = 1;
  }
  // The light pass over the fog itself: a wide, faint white band.
  gm.globalCompositeOperation = "lighter";
  if (passT > 0 && passT < 1) {
    const bw = 0.4 * w;
    gm.globalAlpha = 0.1 * frost;
    gm.drawImage(pass, passX - bw / 2, 0, bw, h);
  }

  // Pass 2: the rods' geometry, their glow into the small buffer now, their bodies onto the canvas after.
  const top = -BLEED * h;
  const hgt = h * (1 + 2 * BLEED);
  const firstW = smooth(FIRST[0], FIRST[1], p);
  const firstDraw = smooth(FIRST[0], FIRST[0] + 0.6 * (FIRST[1] - FIRST[0]), p);
  const rods = lay.rods;
  const geo = lay.geo;
  let n = 0;
  for (let i = 0; i < rods.length; i += 1) {
    const r = rods[i];
    const o = i * 6;
    geo[o] = 0;
    const a = smooth(r.arrive, r.arrive + SLIDE, p);
    if (a <= 0 || rodAlpha <= 0.003) continue;
    const e = easeOutQuint(a);
    const centre = r.k === 0;
    // Peel off the centre and slide to rest; drift a little once there; fly past the camera at the cut.
    let x = centre ? r.rest : lerp(cx, r.rest, e);
    x += DRIFT * Math.sin(t * 0.5 + r.phase) * e * (1 - fly);
    x = cx + (x - cx) * zf;
    const wr = (centre ? lerp(1.5, r.w, firstW) : r.w * lerp(0.4, 1, e)) * Math.sqrt(zf);
    const alpha = Math.min(1, a * 3) * rodAlpha;
    if (alpha <= 0.003) continue;
    // The centre rod draws down the screen from its middle; the others arrive whole.
    const yt = centre ? cy + (top - cy) * firstDraw : top;
    const yh = centre ? hgt * firstDraw : hgt;
    const xs = x - wr / 2;
    if (xs > w || xs + wr < 0 || yh < 1) continue;
    const d = (x - passX) / (0.12 * w);
    const light = passT > 0 && passT < 1 ? Math.exp(-d * d) : 0;
    geo[o] = 1;
    geo[o + 1] = xs;
    geo[o + 2] = wr;
    geo[o + 3] = yt;
    geo[o + 4] = yh;
    geo[o + 5] = light;
    n += 1;
    // The glow bleeding into the fog around the rod.
    gm.globalAlpha = (0.26 + 0.3 * light) * alpha * frost;
    gm.drawImage(glow[r.hue], xs - wr, yt, 3 * wr, yh);
  }

  // The glow behind the mark, rising with it and gone as the fog clears.
  const glowM = smooth(MARK[0], MARK[1], p) * (cut ? 1 - smooth(0.5, 1, since) : 1);
  if (glowM > 0.01) {
    const rr = 0.32 * Math.min(w, h);
    const g = gm.createRadialGradient(cx, cy, 0, cx, cy, rr);
    g.addColorStop(0, `rgba(255,255,255,${(0.2 * glowM).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(255,255,255,${(0.06 * glowM).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    gm.globalAlpha = 1;
    gm.fillStyle = g;
    gm.fillRect(cx - rr, cy - rr, 2 * rr, 2 * rr);
  }
  gm.globalCompositeOperation = "source-over";
  gm.globalAlpha = 1;
  gm.setTransform(1, 0, 0, 1, 0, 0);

  // Pass 3: the canvas. Dark glass, the fog (from the buffer, or straight from the frame late in the clearing), then the buffer.
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "low";
  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, w, h);
  if (!fogInMid && video && ready) {
    const [sw, sh] = sample(video, bufs.coarse, w, h, f);
    ctx.globalAlpha = reveal;
    ctx.drawImage(bufs.coarse, 0, 0, sw, sh, 0, 0, w, h);
    ctx.globalAlpha = 1;
    if (n > 0) [fw, fh] = sample(video, bufs.fine, w, h, FINE);
  }
  ctx.drawImage(bufs.mid, 0, 0, mw, mh, 0, 0, w, h);

  // Pass 4: the rods' bodies. Their ends run past the canvas, so no clip is needed.
  for (let i = 0; i < rods.length; i += 1) {
    const o = i * 6;
    if (geo[o] === 0) continue;
    const r = rods[i];
    const xs = geo[o + 1];
    const wr = geo[o + 2];
    const yt = geo[o + 3];
    const yh = geo[o + 4];
    const light = geo[o + 5];
    const a = smooth(r.arrive, r.arrive + SLIDE, p);
    const alpha = Math.min(1, a * 3) * rodAlpha;

    // Through the rod: the picture a little clearer and bent sideways, fixed to the page so a sliding rod reveals what is behind it.
    if (fw > 0) {
      const shift = REFRACT * wr;
      const x0 = Math.max(0, xs);
      const x1 = Math.min(w, xs + wr);
      const u0 = Math.min(Math.max(0, x0 + shift), w - 1);
      const u1 = Math.min(Math.max(u0 + 1, x1 + shift), w);
      if (x1 > x0) {
        ctx.globalAlpha = alpha * reveal;
        ctx.drawImage(bufs.fine, u0 / FINE, 0, (u1 - u0) / FINE, fh, x0, Math.max(0, yt), x1 - x0, Math.min(h, yt + yh) - Math.max(0, yt));
      }
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.55 * DIM * frost * alpha;
      ctx.fillRect(xs, yt, wr, yh);
    }
    // Glass: milky, tinted by its hue.
    ctx.globalAlpha = alpha * frost;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(xs, yt, wr, yh);
    ctx.fillStyle = TINT[r.hue];
    ctx.fillRect(xs, yt, wr, yh);
    // The light in it: a specular running down the rod, a bright core that rests near the middle and breathes, and the flare of the pass.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.28 * alpha * frost;
    ctx.drawImage(tube, xs, yt, wr, yh);
    const bandH = 0.42 * h;
    const bandY = r.band * h + 0.03 * h * Math.sin(t * 0.6 + r.phase);
    ctx.globalAlpha = 0.6 * alpha * frost;
    ctx.drawImage(band[r.hue], xs, bandY - bandH / 2, wr, bandH);
    if (light > 0.01) {
      ctx.globalAlpha = 0.55 * light * alpha;
      ctx.fillStyle = HOT[r.hue];
      ctx.fillRect(xs, yt, wr, yh);
    }
    ctx.globalCompositeOperation = "source-over";
    // Edges: a specular on the left, a shade on the right.
    ctx.globalAlpha = 0.45 * alpha * frost;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(xs, yt, 1, yh);
    ctx.globalAlpha = 0.3 * alpha * frost;
    ctx.fillStyle = "#000000";
    ctx.fillRect(xs + wr - 1, yt, 1, yh);
    ctx.globalAlpha = 1;
  }

  // The rise out of black at the very start.
  if (rise < 1) {
    ctx.globalAlpha = 1 - rise;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}
