/**
 * Rasterises the Stage spotlight beam into a static WebP, so the runtime
 * <Spotlight> mounts a plain <img> instead of a live filtered SVG (filter:
 * blur() on elements a spring kept moving was the Stage section's main jank).
 *
 * Run after changing the cone shape below:
 *
 *   npm run spotlight
 *
 * Node's built-in TypeScript support (type stripping) runs this directly.
 * Output is committed under public/brand/spotlight/.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/brand/spotlight");

/** Three concentric warm cones of increasing blur, baked into one texture. */
function coneSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1400" width="1000" height="1400">
    <defs>
      <linearGradient id="amber" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FBBC04" stop-opacity="0"/>
        <stop offset=".4" stop-color="#FBBC04" stop-opacity=".14"/>
        <stop offset="1" stop-color="#FFCD50" stop-opacity=".40"/>
      </linearGradient>
      <linearGradient id="core" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#FFE696" stop-opacity="0"/>
        <stop offset=".45" stop-color="#FFE696" stop-opacity=".26"/>
        <stop offset="1" stop-color="#FFF2C8" stop-opacity=".9"/>
      </linearGradient>
      <filter id="blur40" x="-60%" y="-20%" width="220%" height="140%"><feGaussianBlur stdDeviation="40"/></filter>
      <filter id="blur22" x="-60%" y="-20%" width="220%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>
      <filter id="blur10" x="-60%" y="-20%" width="220%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
    </defs>
    <polygon points="460,0 540,0 950,1400 50,1400" fill="url(#amber)" opacity=".6" filter="url(#blur40)"/>
    <polygon points="475,0 525,0 725,1400 275,1400" fill="url(#amber)" opacity=".85" filter="url(#blur22)"/>
    <polygon points="488,0 512,0 610,1400 390,1400" fill="url(#core)" filter="url(#blur10)"/>
  </svg>`;
}

await mkdir(OUT, { recursive: true });
const out = path.join(OUT, "cone.webp");
// Purely soft gradients: a lower raster size loses nothing visible once blurred.
await sharp(Buffer.from(coneSvg()), { density: 96 }).resize(800, 1120, { fit: "fill" }).webp({ quality: 80 }).toFile(out);
console.log("cone".padEnd(24) + path.relative(ROOT, out));
