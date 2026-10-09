import Image from "next/image";
import { DGL } from "@/data/dgl";

const c = DGL.copy;

/**
 * The DevFest Got Latent title strip (public/brand/dgl/dgl-banner.webp,
 * 2400 x 300, built from the poster by `npm run dgl:banner`) along the top of
 * every stage screen that is not the full poster. Full width, about 22vh at
 * 16:9, capped so a tall window never gives it more than a quarter of the
 * height; its bottom edge fades into the canvas so the content under it has no
 * hard line to sit against. Above the timer's ring (`z-10`), which can reach
 * up into this corner.
 */
export function StageBanner() {
  return (
    <div className="relative z-10 w-full shrink-0">
      <Image
        src="/brand/dgl/dgl-banner.webp"
        alt={c.bannerAlt}
        width={2400}
        height={300}
        priority
        sizes="100vw"
        className="block h-auto max-h-[24vh] w-full object-cover"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  );
}

/**
 * The full poster (public/brand/dgl/dgl-poster.webp, 1502 x 1047) filling its
 * parent while the stage is waiting or between acts. `cover` and weighted
 * towards the lower middle (the title and the stage floor) from lg up;
 * `contain` below it so a phone or a narrow window never crops the title. The
 * parent must be `relative` and `overflow-hidden`.
 */
export function StagePoster() {
  return (
    <Image
      src="/brand/dgl/dgl-poster.webp"
      alt={c.posterAlt}
      width={1502}
      height={1047}
      priority
      sizes="100vw"
      className="absolute inset-0 size-full object-contain object-[50%_60%] lg:object-cover"
    />
  );
}
