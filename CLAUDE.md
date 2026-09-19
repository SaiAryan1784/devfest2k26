@AGENTS.md

# DevFest Noida 2026 site

Design-led event landing page for GDG Noida. Next.js 16 App Router + Tailwind v4 + Motion + ReactBits. Dark only.
Full spec: docs/SPEC.md (copy of the approved plan). Reference glimpse: docs/reference/glimpse-v2.html. Figma originals: docs/reference/figma/. Brand assets: public/brand/.

## Rules
- Server Components by default; `'use client'` only on motion/pointer/scroll leaves.
- Motion (`motion/react`) for all UI motion we author. GSAP appears only inside a vendored ReactBits component that ships with it (currently `PillNav`); never hand-authored, and never on the same element as Motion.
- Continuous values (pointer, scroll) use MotionValues, never useState. No window scroll listeners. No Lenis or other scroll-hijacking library: sections that pin use native `position: sticky` and read progress with `useScroll`/`useTransform` (see Tracks/`TrackStack.tsx`).
- A Motion `initial`/`animate`/`while*` **value** must never branch on `useReducedMotion()` directly (it resolves after mount and can differ between the server's render and a client whose OS already prefers reduced motion, which is a hydration mismatch). Only `transition` may branch on it (`transition={reduce ? { duration: 0 } : {...}}`), landing on the exact same target either way. Gate any state (like a hover index) that feeds an animate value behind `if (reduce) return;` in the handler instead.
- The hero is a billboard: `HeroVideo` plays the silent 46 s loop in `public/video/` (encoded by `scripts/encode-hero-video.sh` from the gitignored source in `docs/reference/video/`: HEVC `hvc1` files for browsers that decode it in hardware, H.264 for the rest; paths and the description line live in `EVENT.hero`) under two scrims, with its poster painted beneath as a real `<img>` so the LCP never waits for video. The `<video>` gets its `src` on the client only (`canPlayType` picks HEVC or H.264, 720p below 768 px), never under reduced motion or Save-Data, and plays only while at least half the hero is on screen (`useHeroView`). No `backdrop-filter` may sit over the moving picture: the nav's scrolled glass switches to a solid ground while the hero is in view. The copy is one left column; the lockup there is the loader's glide target. Every light mark on the page is `LightPipe` over a shape in `pipes.ts`; light colour comes from `PAL`/`SPECTRUM` in `slabs.ts`. The one paint-animated layer per view is the active track card's `pipe-run` stroke.
- Blur on parent, clip-path on child. Never both on one element when soft edges are wanted.
- No `backdrop-filter` except through the `.glass-live` utility, and only where real imagery moves behind the panel (nav once scrolled, the mobile menu, a card over the map or hero). Everywhere else (cards, tiles, cells over the flat canvas) use `.glass` (no backdrop-filter) or `.glass-pill` (pills). See globals.css.
- WebGL only via next/dynamic ssr:false, DPR capped at 1 (ambient glow: `PrismaticBurst` in the final CTA) or 1.5 max, paused off-screen, unmounted under reduced motion. Never in the hero or the loader.
- No `mix-blend-mode` on a full-viewport layer (forces a re-blend against everything below on every repaint, not just its own).
- All content lives in src/data/*.ts. Never hardcode event facts in components.
- Copy: sentence case, no em/en dashes, one label per CTA intent ("Join the waitlist").
- Tokens only from globals.css @theme. Radius: panels 24, cards 20, buttons pill. Icons: Phosphor regular, one family.
- Every animation honours useReducedMotion(). The loader gate is hidden under reduced motion by `.loader-gate` in globals.css (the component cannot know the preference before it mounts); `Z.loader` sits under the grain on purpose. Progress the loader draws is `min(real, clock)`: never ahead of what has loaded, never ahead of the choreography.
- Lockup geometry lives in `src/components/brand/lockup-paths.ts`; `Lockup` renders from it everywhere. The loader is the ident (`IdentStage`, `IdentField`, `ident-field.ts`), one physical idea, a prism: on black, a soft seam of white light comes up at the centre and disperses into the site's spectrum of vertical stripes (12 px cores at a 30 px pitch on desktop, two fainter layers behind), white at the centre and in hue by distance; the mark pulls into focus over a halo that dims the stripes behind it; at the cut the field rushes past the camera while the black dissolves onto the billboard's video, already playing under the gate. Drawn in code (Canvas 2D, transparent, DPR 1, `lighter` only, 1-D sprites blitted stretched, no image files, no WebGL, no ReactBits, no filters, no hairlines), in passes with a scratch array; nothing full-screen uses a gradient fill or `imageSmoothingQuality: "high"` (measured: five blits' worth each). Tunables (pitch, widths, timings, wave, push) sit at the top of `ident-field.ts`; the hold is `HOLD_MS` in `Loader.tsx`, the cut is `cut.ts`.
- Fonts come from next/font/google (Google Sans Flex with the wdth axis only, 116 KB; adding opsz or slnt balloons it to 300-500 KB. Google Sans Code for mono). No <link> to Google Fonts.
- ReactBits components are added with the shadcn CLI into src/components/reactbits/ and restyled to tokens; do not rewrite their motion logic. A documented perf/correctness patch (with a comment explaining why) is fine; see VariableProximity.tsx, PillNav.tsx and ScrollReveal.tsx for the pattern.
- One marquee on the page, at most. A marquee is for many things that do not need individual attention; a handful of logos is not that.
- Section rhythm is `py-20 md:py-24 lg:py-28`. Anything looser reads as unfinished on a wide screen.
- Reduced-motion fallbacks for scroll-linked reveals go in the globals.css `prefers-reduced-motion` block (see `.schedule-slot`, `.schedule-pipe`), not in a JS branch on `useReducedMotion()`.
- SVG gradients on a stroked line need `gradientUnits="userSpaceOnUse"`. A horizontal or vertical line has a zero-height or zero-width bounding box, so the default objectBoundingBox gradient degenerates and paints nothing.
- Venue is TBD: `EVENT.venue` carries `status`, `label` and `region` only. Put the name, address and map back in that one object when it is confirmed.
- Before claiming done: run the section 12 checks in docs/SPEC.md.

## Commands
- `npm run dev` / `npm run build` / `npm run lint`
- `npm run spotlight` regenerates `public/brand/spotlight/cone.webp` from `scripts/render-spotlight.mts`
- `scripts/encode-hero-video.sh` rebuilds `public/video/` from the source aftermovie (needs ffmpeg: `brew install ffmpeg`)
- `npx shadcn@latest add @react-bits/<Name>-TS-TW` (registry is configured in components.json), then move the created file from `src/components/<Name>.tsx` into `src/components/reactbits/` if the CLI doesn't place it there itself
