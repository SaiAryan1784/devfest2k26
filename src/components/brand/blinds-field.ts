import { SPECTRUM } from "./slabs";

/**
 * Blinds: thick strips of frosted glass over the billboard's video. Each
 * strip shows the slice of the picture behind it, blurred, by drawing the
 * current video frame once per frame into a small buffer and stretching that
 * strip's column back up (a 10x upscale is the blur, for free). Over that, a
 * milky tint, a spectrum tint by x, a vertical shade and glass edges. The
 * strips arrive from the centre outward, a light passes across them, the
 * mark appears in front, and at the cut they un-frost (the buffer's scale
 * runs continuously to 1:1) and widen until the gaps close, so the canvas
 * ends holding the exact picture the real video shows underneath.
 *
 * Pure drawing, no React. Canvas 2D on a transparent canvas over the gate's
 * black backdrop; no backdrop-filter anywhere. Per frame: one small copy of
 * the video and about fifteen clipped strips.
 */

export type Strip = { k: number; order: number; cx: number; fromTop: boolean; hue: number; phase: number; arrive: number };
export type Layout = { strips: Strip[]; strip: number; gap: number; pitch: number; top: number; height: number; shade: CanvasGradient | null };

/** Strip width and gap, desktop and phone. */
export const STRIP = { wide: 56, narrow: 36 };
export const GAP = { wide: 40, narrow: 24 };
export const NARROW = 768;
export const RADIUS = 10;
/** How far the strips run past the top and bottom, as a fraction of the height. */
export const BLEED = 0.06;
/** Drawn progress at which the first strip opens from a hairline to full width. */
export const FIRST: [number, number] = [0.08, 0.2];
/** Drawn progress over which the other strips arrive, centre outward. */
export const ARRIVE: [number, number] = [0.15, 0.55];
/** Drawn progress one strip takes to slide in. */
export const SLIDE = 0.14;
/** The light pass, left to right. */
export const PASS: [number, number] = [0.55, 0.75];
/** The mark's fade, used by the stage; the glow behind it is drawn here. */
export const MARK: [number, number] = [0.6, 0.7];
/** Seconds into the cut by which every strip has un-frosted and every gap has closed. */
export const OPEN_S = 1.2;
/** Downscale factor of the frosted picture at rest (the blur), and where the un-frost stops: half resolution, so the last of the softness leaves with the canvas fade rather than costing a full-size copy per frame. */
export const FROST = 10;
export const CLEAR = 2;
/** Breathing amplitude in px. */
export const BREATH = 6;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t: number) => {
  const c1 = 0.9;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
const TINT = SPECTRUM.map((p) => `rgba(${hexRgb(p.mid)},0.1)`);
const HOT = SPECTRUM.map((p) => p.hot);

/** Lay the strips out for a canvas of this size: one at the centre, then outward. */
export function layout(w: number, h: number): Layout {
  const narrow = w < NARROW;
  const strip = narrow ? STRIP.narrow : STRIP.wide;
  const gap = narrow ? GAP.narrow : GAP.wide;
  const pitch = strip + gap;
  const n = Math.ceil(w / 2 / pitch) + 1;
  const total = 2 * n;
  const strips: Strip[] = [];
  for (let k = -n; k <= n; k += 1) {
    const order = k === 0 ? 0 : 2 * Math.abs(k) - (k > 0 ? 1 : 0);
    const cx = w / 2 + k * pitch;
    strips.push({
      k,
      order,
      cx,
      fromTop: order % 2 === 1,
      hue: Math.min(SPECTRUM.length - 1, Math.max(0, Math.floor((cx / w) * SPECTRUM.length))),
      phase: ((k * 7919) % 360) * (Math.PI / 180),
      arrive: k === 0 ? FIRST[0] : ARRIVE[0] + (ARRIVE[1] - ARRIVE[0]) * ((order - 1) / Math.max(1, total - 1)),
    });
  }
  return { strips, strip, gap, pitch, top: -BLEED * h, height: h * (1 + 2 * BLEED), shade: null };
}

export type FieldState = {
  /** Drawn progress, 0..1. */
  p: number;
  /** Seconds into the cut, or a negative number before it. */
  since: number;
  t: number;
};

/**
 * @param sample an offscreen canvas the size of the main one; the video frame is drawn into its top-left corner at 1/f scale
 */
export function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, video: HTMLVideoElement | null, sample: HTMLCanvasElement, lay: Layout, s: FieldState) {
  const { p, since, t } = s;
  const cut = since >= 0;
  const openAll = cut ? easeInOut(smooth(0, OPEN_S, since)) : 0;
  const f = lerp(FROST, CLEAR, openAll);

  ctx.clearRect(0, 0, w, h);

  // The picture behind the glass: the part of the frame `object-fit: cover` shows, at 1/f scale.
  const ready = Boolean(video && video.readyState >= 2 && video.videoWidth > 0);
  let sh = 0;
  if (video && ready) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(w / vw, h / vh);
    const cw = w / scale;
    const ch = h / scale;
    const sw = Math.max(1, Math.round(w / f));
    sh = Math.max(1, Math.round(h / f));
    const g = sample.getContext("2d");
    if (g) {
      g.imageSmoothingEnabled = true;
      g.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, sw, sh);
    }
  }
  ctx.imageSmoothingEnabled = true;
  // Bicubic only while the picture is a small buffer; once it nears full size the cheap filter is enough and the frame budget matters more.
  ctx.imageSmoothingQuality = f > 6 ? "high" : "low";
  if (!lay.shade) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(0,0,0,0.42)");
    g.addColorStop(0.3, "rgba(0,0,0,0)");
    g.addColorStop(0.7, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.42)");
    lay.shade = g;
  }

  const passX = lerp(-0.2 * w, 1.2 * w, smooth(PASS[0], PASS[1], p));
  const firstW = lerp(1.5, lay.strip, smooth(FIRST[0], FIRST[1], p));

  for (const st of lay.strips) {
    const a = smooth(st.arrive, st.arrive + SLIDE, p);
    if (a <= 0) continue;
    const e = easeOutBack(a);
    const restW = st.k === 0 ? firstW : lay.strip;
    // The cut: widen to close the gap, centre first, while the frost lifts everywhere.
    const delay = 0.05 * Math.abs(st.k);
    const open = cut ? easeInOut(smooth(delay, delay + 0.6, since)) : 0;
    const ws = lerp(restW, lay.pitch + 2, open);
    const xs = st.cx - ws / 2;
    if (xs > w || xs + ws < 0) continue;
    const slide = (1 - e) * (st.fromTop ? -1 : 1) * h * 1.1;
    const breath = BREATH * Math.sin(t * 0.6 + st.phase) * a * (1 - open);
    const top = lay.top + slide + breath;
    const hgt = lay.height;
    if (top > h || top + hgt < 0) continue;
    const frost = 1 - openAll;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(xs, top, ws, hgt, RADIUS * (1 - open) + 0.01);
    ctx.clip();

    // The world behind the window: fixed to the page, so a sliding strip reveals what is under it.
    if (ready) {
      const x0 = Math.max(0, xs);
      const x1 = Math.min(w, xs + ws);
      if (x1 > x0) ctx.drawImage(sample, x0 / f, 0, (x1 - x0) / f, sh, x0, 0, x1 - x0, h);
    } else {
      ctx.fillStyle = "#101014";
      ctx.fillRect(xs, top, ws, hgt);
    }

    // Frosted glass: milky, tinted by the spectrum, shaded at both ends.
    if (frost > 0.002) {
      ctx.globalAlpha = frost;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(xs, top, ws, hgt);
      ctx.fillStyle = TINT[st.hue];
      ctx.fillRect(xs, top, ws, hgt);
      ctx.fillStyle = lay.shade;
      ctx.fillRect(xs, 0, ws, h);
      ctx.globalAlpha = 1;
    }

    // The light pass.
    const d = (st.cx - passX) / (0.12 * w);
    const light = Math.exp(-d * d);
    if (light > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.45 * light;
      ctx.fillStyle = HOT[st.hue];
      ctx.fillRect(xs, top, ws, hgt);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // Glass edges: a specular on the left, a shade on the right.
    if (frost > 0.002) {
      ctx.globalAlpha = 0.35 * frost;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(xs, top, 1, hgt);
      ctx.fillStyle = "#000000";
      ctx.fillRect(xs + ws - 1, top, 1, hgt);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // The glow behind the mark, rising with it and gone once the blinds open.
  const glow = smooth(MARK[0], MARK[1], p) * (cut ? 1 - smooth(0.6, OPEN_S, since) : 1);
  if (glow > 0.01) {
    const r = 0.32 * Math.min(w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
    g.addColorStop(0, `rgba(255,255,255,${(0.22 * glow).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(255,255,255,${(0.07 * glow).toFixed(3)})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(w / 2 - r, h / 2 - r, 2 * r, 2 * r);
    ctx.globalCompositeOperation = "source-over";
  }
}
