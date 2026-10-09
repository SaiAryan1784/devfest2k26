/**
 * Builds the DevFest Got Latent banner strip (2400 x 300) for the stage
 * screens that are not the full-poster ones, from the poster itself: the
 * title crop, scaled to the strip height and centred over a background made
 * of the poster's top curtain area stretched to the full width, with the
 * crop's edges feathered into it so no seam shows.
 *
 * Run after changing the poster or the numbers below:
 *
 *   npm run dgl:banner
 *
 * Output is committed under public/brand/dgl/.
 */

import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(import.meta.dirname, "..");
const DIR = path.join(ROOT, "public/brand/dgl");
const POSTER = path.join(DIR, "dgl-poster.webp");
const OUT = path.join(DIR, "dgl-banner.webp");

const W = 2400;
const H = 300;

/** The title (and a little curtain around it) in poster pixels, 1502 x 1047. */
const CROP = { left: 0, top: 190, width: 1502, height: 600 };
/** Where the title sits in the strip: scaled to this height, centred. Under the full 300 so the short-screen cap (which crops the strip a little top and bottom) never touches a letter. */
const TITLE_H = 252;
/** The curtain band the background is stretched from, in poster pixels. */
const CURTAIN = { left: 0, top: 70, width: 1502, height: 140 };
/** Feather widths in strip pixels: they eat curtain padding only, never a letter. */
const FEATHER_X = 40;
const FEATHER_TOP = 18;
const FEATHER_BOTTOM = 10;
/** The laptop's lid pokes into the crop at the bottom right: from this poster x on, the crop ends at LAPTOP_Y. */
const LAPTOP_X = 1170;
const LAPTOP_Y = 724;

const smooth = (t: number) => t * t * (3 - 2 * t);

const titleW = Math.round((CROP.width * TITLE_H) / CROP.height);
const left = Math.round((W - titleW) / 2);

// Alpha mask for the title crop: 1 inside, easing to 0 over the feather widths on every side.
const scale = TITLE_H / CROP.height;
const mask = Buffer.alloc(titleW * TITLE_H * 4, 255);
for (let y = 0; y < TITLE_H; y++) {
  for (let x = 0; x < titleW; x++) {
    const posterX = x / scale + CROP.left;
    const bottom = posterX > LAPTOP_X ? Math.round((LAPTOP_Y - CROP.top) * scale) : TITLE_H;
    const dx = Math.min(x, titleW - 1 - x) / FEATHER_X;
    const dy = Math.min(y / FEATHER_TOP, (bottom - y) / FEATHER_BOTTOM);
    const a = smooth(Math.max(0, Math.min(1, dx))) * smooth(Math.max(0, Math.min(1, dy)));
    mask[(y * titleW + x) * 4 + 3] = Math.round(a * 255);
  }
}

const background = await sharp(POSTER).extract(CURTAIN).resize(W, H, { fit: "fill" }).blur(10).toBuffer();

const title = await sharp(POSTER)
  .extract(CROP)
  .resize(titleW, TITLE_H, { fit: "fill" })
  .ensureAlpha()
  .composite([{ input: mask, raw: { width: titleW, height: TITLE_H, channels: 4 }, blend: "dest-in" }])
  .png()
  .toBuffer();

await mkdir(DIR, { recursive: true });
await sharp(background).composite([{ input: title, left, top: Math.round((H - TITLE_H) / 2) }]).webp({ quality: 85 }).toFile(OUT);
console.log("banner".padEnd(24) + path.relative(ROOT, OUT));
