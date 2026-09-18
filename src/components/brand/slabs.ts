import type { TrackColor } from "@/data/event";

/**
 * Pure geometry and SVG-string generation for the procedural "glass slab"
 * effect (port of `slabs()` in docs/reference/glimpse-v2.html). No React, no
 * DOM: this file is imported both by `GlassSlabs.tsx` (for the id-suffixed
 * live version, kept for any future animated use) and by
 * `scripts/render-slabs.ts` (a plain Node script, run via
 * `node --experimental-strip-types`, that rasterises one static poster per
 * colour/side with sharp). Keep this the single source of truth for the
 * shape so the posters never drift from the live SVG.
 */

export type Palette = { hot: string; hi: string; mid: string; lo: string };
export type SlabSide = "left" | "right";

export const PAL: Record<Exclude<TrackColor, "spectrum">, Palette> = {
  blue: { hot: "#EAF2FF", hi: "#8AB4F8", mid: "#4285F4", lo: "#1B49B8" },
  red: { hot: "#FFE9E6", hi: "#FF8A80", mid: "#EA4335", lo: "#9E1F17" },
  yellow: { hot: "#FFF8DD", hi: "#FFE082", mid: "#FBBC04", lo: "#B87800" },
  green: { hot: "#E6FAEC", hi: "#81C995", mid: "#34A853", lo: "#0F6B33" },
};

// Outer to inner hue per slab for the spectrum set.
export const SPECTRUM: Palette[] = [
  { hot: "#E6F4FF", hi: "#8AB4F8", mid: "#4285F4", lo: "#1B49B8" },
  { hot: "#E6FBFF", hi: "#7FE3FF", mid: "#33C6F5", lo: "#0B7FA8" },
  { hot: "#E6FAEC", hi: "#81C995", mid: "#34A853", lo: "#0F6B33" },
  { hot: "#F7FFE0", hi: "#D9F27A", mid: "#B5E000", lo: "#6E8A00" },
  { hot: "#FFF8DD", hi: "#FFE082", mid: "#FBBC04", lo: "#B87800" },
  { hot: "#FFEEDD", hi: "#FFB27A", mid: "#FF7A1A", lo: "#B24C00" },
  { hot: "#FFE9E6", hi: "#FF8A80", mid: "#EA4335", lo: "#9E1F17" },
];

export const GLOW: Record<TrackColor, string> = {
  blue: "#4285F4",
  red: "#EA4335",
  yellow: "#FBBC04",
  green: "#34A853",
  spectrum: "#34A853",
};

export const W = 560;
export const H = 1000;
export const N = 7;
export const SLAB = 52;
export const STEP = 34;
export const JOG = 52;

export type SlabGeom = {
  i: number;
  p: Palette;
  d: string;
  stops: [string | number, string][];
};

export function bendY(side: SlabSide) {
  return side === "left" ? 330 : 640;
}

/** The seven overlapping S-bend slab paths and their gradient stops. */
export function slabGeometry(side: SlabSide, color: TrackColor): SlabGeom[] {
  const dir = side === "left" ? 1 : -1;
  const by = bendY(side);
  const clamp = (y: number) => Math.max(0, Math.min(1, y / H)).toFixed(3);
  return Array.from({ length: N }, (_, i) => {
    const p = color === "spectrum" ? SPECTRUM[side === "left" ? i : N - 1 - i] : PAL[color];
    const x = side === "left" ? 30 + i * STEP : W - 30 - i * STEP;
    const x2 = x + dir * JOG;
    const hotY = (side === "left" ? by + 260 : by - 220) + i * 38;
    return {
      i,
      p,
      d: `M${x} -40 V${by} C${x} ${by + 60} ${x2} ${by + 40} ${x2} ${by + 110} V${H + 40}`,
      stops: [
        [0, p.hi],
        [clamp(hotY - 320), p.mid],
        [clamp(hotY - 60), p.hot],
        [clamp(hotY + 60), p.hot],
        [clamp(hotY + 380), p.mid],
        [1, p.lo],
      ] as [string | number, string][],
    };
  });
}

/**
 * A complete, standalone SVG document string for one side/colour: bloom copy,
 * the seven slabs (shadow, body, right-half shade, specular edge; no sheen,
 * posters are static), and the inward fade. Used by the render script to
 * rasterise a poster, and available for any live (non-poster) use since it
 * takes a fixed `id` rather than a React-generated one.
 */
export function renderSlabSvg(side: SlabSide, color: TrackColor, opts: { id?: string; intensity?: number } = {}): string {
  const id = opts.id ?? `${color}-${side}`;
  const intensity = opts.intensity ?? 1;
  const dir = side === "left" ? 1 : -1;
  const slabs = slabGeometry(side, color);

  const gradients = slabs
    .map(
      ({ i, stops }) =>
        `<linearGradient id="g${id}${i}" x1="0" y1="0" x2="0" y2="1">${stops
          .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
          .join("")}</linearGradient>`,
    )
    .join("");

  const fadeFrom = side === "left" ? 0 : 1;
  const fadeTo = side === "left" ? 1 : 0;

  const bloom = slabs
    .map(({ i, d }) => `<path d="${d}" stroke="url(#g${id}${i})" stroke-width="${SLAB * 1.5}"/>`)
    .join("");

  const body = [...slabs]
    .reverse()
    .map(({ i, d }) => {
      const depth = i / (N - 1);
      const opacity = (1 - depth * 0.42).toFixed(2);
      return `<g opacity="${opacity}">
        <path d="${d}" stroke="#000" stroke-width="20" opacity=".9" transform="translate(${dir * (SLAB / 2 + 7)} 0)" filter="url(#bl${id})"/>
        <path d="${d}" stroke="url(#g${id}${i})" stroke-width="${SLAB}"/>
        <path d="${d}" stroke="#000" stroke-width="${SLAB * 0.5}" opacity=".5" transform="translate(${dir * SLAB * 0.28} 0)" filter="url(#bl${id})"/>
        <path d="${d}" stroke="#fff" stroke-width="2" opacity=".9" transform="translate(${-dir * (SLAB / 2 - 1)} 0)"/>
      </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none">
    <defs>
      <filter id="bl${id}" x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
      <filter id="bloom${id}" x="-50%" y="-20%" width="200%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>
      <linearGradient id="fade${id}" x1="${fadeFrom}" y1="0" x2="${fadeTo}" y2="0">
        <stop offset=".45" stop-color="#0b0b0d" stop-opacity="0"/>
        <stop offset="1" stop-color="#0b0b0d" stop-opacity="1"/>
      </linearGradient>
      ${gradients}
    </defs>
    <g filter="url(#bloom${id})" opacity="${0.8 * intensity}">${bloom}</g>
    ${body}
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#fade${id})"/>
  </svg>`;
}
