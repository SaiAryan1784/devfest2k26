# DevFest Noida 2026 — Website Build Spec

This file is the complete implementation document. A fresh Claude Code session should be able to build the site from this file alone. Sections: Context → Decisions → Tokens → Architecture → Component specs → Section specs → Loader spec → Data → Performance rules → Accessibility → Build order → Verification → Project CLAUDE.md.

---

## 1. Context

GDG Noida runs DevFest every year. 2025: Expo Inn, Greater Noida, 4,400+ registered, 70+ speakers. 2026 has four tracks (AI Overloaded, AI ABC, AI × Hardware, Hands-on) plus nine floor experiences; see `src/data/`. The 2026 edition is **10 October 2026**. Waitlist is open at `https://www.commudle.com/fill-form/5096`. The organisers want a design-led site, not a Commudle listing.

Visual direction is fixed by Figma exports (seven PNGs + three logo SVGs) and was validated in two glimpses. The approved glimpse (`glimpse2.html`) has three things the client called "great":

1. **Hero** whose left/right edges are the actual Figma "glass slab" exports, crossfading through the five colour sets (spectrum, blue, red, yellow, green), with pointer parallax, the real DevFest lockup (pill colour synced to the active set), a two-line headline using Google Sans Flex width-axis emphasis, two CTAs, and a bottom facts row.
2. **Track panels** with procedurally generated glass slabs (SVG: gradient-filled stroked paths + specular edge + cast shadow + bloom) so each track carries its own colour and can animate.
3. **Stage** section with a CSS spotlight cone and floor glow (mirrors the amber spotlight export) lighting a glass speaker pill.

Client additions after the glimpse: a **page loader built from glass elements with several Motion (Framer Motion) animations**; stack is **Next.js + Tailwind CSS**; this document is the final spec.

Project root: `/Users/nuclear1784/devfest2k26/` (empty).

Source assets (copy into the repo in step 1):
- Figma PNGs: extracted at `/private/tmp/claude-501/-Users-nuclear1784/48958a4e-5078-4e92-8b85-31ceb3fad764/scratchpad/figma/*.png` (original zip: `/Volumes/Sai's HDD/Downloads/GDG Devfest Noida 2026.zip`)
  - `3150765d-…1.png` spectrum · `1e9eca6a-…4.png` blue · `8d63265a-…2.png` red · `99e75f1d-…2.png` yellow · `0d4e76e3-…2.png` green (all 1080×1350)
  - `image 4593.png` glyph sheet (25 light-pipe shapes) · `image 4594.png` mood board
- Logo SVGs: `/Volumes/Sai's HDD/Downloads/devfest logo.svg` (green pill #34A853), `devfest logo (1).svg` (yellow pill #FBB000), `devfest logo (2).svg` (blue pill #57CAFF). Same lockup, only the pill fill differs; white text + `#202124` strokes, designed for dark backgrounds.
- Approved glimpse: `/private/tmp/claude-501/-Users-nuclear1784/48958a4e-5078-4e92-8b85-31ceb3fad764/scratchpad/glimpse2.html` (copy to `docs/reference/glimpse-v2.html`; the slab generator and spotlight CSS in it are the reference implementation to port).
- Brand site for socials/logos: `https://gdgnoida.com` (`/assets/gdg_logo.svg`, `/assets/noida_long_logo0.svg`).

## 2. Decisions (locked)

| Decision | Value |
|---|---|
| Framework | Next.js (latest stable via `create-next-app`, App Router, TypeScript, `src/`), React 19 |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss`; tokens in `@theme` in `globals.css` |
| UI motion | `motion` (import from `motion/react`) for all UI/state/gesture/loader motion |
| Scroll/pin | ReactBits `ScrollStack` (Lenis under the hood) for Tracks only. No other pinned section. |
| Text splitting | ReactBits `SplitText` (GSAP) on hero headline only. GSAP and Motion never touch the same element. |
| WebGL | ReactBits `Prism` (hero floor glow) and `PrismaticBurst` (final CTA) only, loaded with `next/dynamic({ ssr: false })`, DPR capped at 1.5, paused when off-screen |
| ReactBits install | shadcn registry: `components.json` → `"registries": { "@react-bits": "https://reactbits.dev/r/{name}.json" }`, then `npx shadcn@latest add @react-bits/<Name>-TS-TW` |
| Icons | `@phosphor-icons/react`, `weight="regular"`, one family only |
| Fonts | Google Sans Flex (variable: `opsz 6..144`, `wdth 25..151`, `wght 100..1000`, `slnt -10..0`) for display + body; Google Sans Code for mono. Self-host woff2 in `src/fonts/` via `next/font/local` (download the latin woff2 files from the Google Fonts CSS API response). Fallback if download fails: `next/font/google` Space Grotesk + JetBrains Mono, and say so. |
| Theme | Dark only. `<html class="dark" style="color-scheme: dark">`. No light mode. |
| Deployment | Vercel. Keep `next.config.ts` static-export compatible: no server actions, map via iframe embed, images unoptimised-safe (`images.unoptimized: false` is fine on Vercel; nothing requires a Node server). |
| Routes | `/` only. `/speakers`, `/schedule`, `/sponsors` reserved, not built. |
| Data | All content in `src/data/*.ts`. Real tracks, speakers, sponsors, dates are one-file swaps. |
| Copy | No em-dashes or en-dashes anywhere. Sentence case. One CTA label per intent: "Join the waitlist" everywhere, "See the tracks" only in the hero. |

Design read (taste skill, client-brief mode): event landing for design-conscious developers in Delhi NCR, dark cinematic "glass light" language from the exports. Dials 8 / 8 / 3. Palette and type bans are off (client supplied them); structural rules on.

## 3. Tokens (`globals.css` `@theme`)

```css
@theme {
  --color-canvas: #050505;
  --color-surface: #0b0b0d;
  --color-surface-2: #121216;
  --color-hair: rgb(255 255 255 / .09);
  --color-text: #f5f5f7;
  --color-muted: #9a9aa3;
  --color-blue: #4285F4;   --color-blue-hi: #8AB4F8;  --color-blue-lo: #1B49B8;
  --color-red: #EA4335;    --color-red-hi: #FF8A80;   --color-red-lo: #9E1F17;
  --color-yellow: #FBBC04; --color-yellow-hi: #FFE082; --color-yellow-lo: #B87800;
  --color-green: #34A853;  --color-green-hi: #81C995; --color-green-lo: #0F6B33;
  --font-display: var(--font-gs-flex), system-ui, sans-serif;
  --font-mono: var(--font-gs-code), ui-monospace, monospace;
  --radius-panel: 24px; --radius-card: 20px; --radius-pill: 999px;
  --ease-out: cubic-bezier(.16, 1, .3, 1);
}
```

Type ramp (all `font-variation-settings: "opsz" 144` on display sizes):
- Hero h1: `clamp(2.4rem, 5.6vw, 5.4rem)`, `line-height 1.02`, `tracking -0.035em`, `wght 500`; emphasised span: `wdth 128`, `wght 640`. Max 2 lines (forced `<br>` after "Five tracks.").
- Section h2: `clamp(2.2rem, 5vw, 4.5rem)`, `tracking -0.035em`, `line-height 1`, `wght 500`; emphasised span as above.
- Track name: `clamp(2.6rem, 6vw, 5.5rem)`, `wght 560`, `tracking -0.04em`.
- Body: 16-17px, `line-height 1.5`, colour `muted`, `max-w-[42ch]`.
- Mono labels: 12px, `letter-spacing .14em`, uppercase (only for data labels: date/venue/session counts/times; never as section eyebrows).

Spacing: sections `py-24 md:py-32 lg:py-40`; container `max-w-[1440px] mx-auto px-5 md:px-10 lg:px-14`; hero/tracks/stage/CTA are full-bleed.

Glass recipe (used by loader, nav-on-scroll, speaker cards, venue card):
```
bg-white/[.06] backdrop-blur-2xl border border-white/10
shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_24px_80px_rgba(0,0,0,.45)]
+ ::after 1px bottom edge: linear-gradient(90deg, blue, green, yellow, red) at 35% opacity
+ @media (prefers-reduced-transparency: reduce) { background: #0b0b0d; backdrop-filter: none }
```
This is web glassmorphism, not Apple Liquid Glass; label it as such in code comments.

Shape lock: panels/cards 24/20px, buttons pill, inputs 12px. Nothing else.

## 4. Architecture

```
src/
  app/
    layout.tsx           fonts, metadata, <html class="dark">, <Loader/> gate, grain overlay, skip link
    page.tsx             server component: composes sections in order
    globals.css          @theme tokens, glass utility, keyframes (sheen, floor-glow), reduced-motion block
    opengraph-image.tsx  OG card built from the spectrum export + lockup
  data/
    event.ts             EVENT: name, date (ISO), venue {name, address, mapsEmbedUrl, mapsLink}, links {waitlist, community}, socials, counts {registered2025, speakers2025, tracks}
    tracks.ts            TRACKS: [{ id, name, color: "blue"|"red"|"yellow"|"green"|"spectrum", tagline, description, sessions, format: "talks"|"workshop" }]
    speakers.ts          SPEAKERS_2025: [{ name, role, company, photo: string | null }]
    schedule.ts          DAY: [{ time, title, kind }]
    sponsors.ts          PAST_PARTNERS: [{ name, simpleIconsSlug }]
  components/
    brand/
      Lockup.tsx         DevFest SVG lockup; props { pill: string, className }. Pill fill animates (Motion) on colour change.
      GlassSlabs.tsx     'use client' procedural slab SVG; props { side: "left"|"right", color, intensity?: number, className }
      EdgeExports.tsx    'use client' hero edge images (2 <img> per side, src-swap crossfade)
      Spotlight.tsx      CSS beam + floor; props { x: MotionValue<number> | number, color?: "yellow" }
    loader/
      Loader.tsx         'use client' glass preloader (spec in §7)
      useAssetProgress.ts
    sections/
      Nav.tsx  Hero.tsx  Tracks.tsx  Stage.tsx  Schedule.tsx  Essentials.tsx  Partners.tsx  FinalCta.tsx  Footer.tsx
    reactbits/           files added by the shadcn CLI, restyled to tokens (do not edit their motion logic)
    ui/
      Button.tsx         variants primary (white pill, near-black text) / ghost (glass pill). Focus ring: 2px offset ring in --color-blue-hi.
      Container.tsx  SectionHeading.tsx  MotionSafe.tsx (wraps useReducedMotion)
  lib/
    countdown.ts  z.ts (Z = { nav: 40, overlay: 50, loader: 55, grain: 60 })  cn.ts
  fonts/                 GoogleSansFlex-*.woff2, GoogleSansCode-*.woff2
public/brand/
  exports/{spectrum,blue,red,yellow,green}.webp  (converted from the PNGs, keep PNG originals in docs/reference/)
  glyph-sheet.png  moodboard.png  lockup-{green,yellow,blue}.svg  gdg-logo.svg
docs/reference/glimpse-v2.html  + original PNGs
```

Rules: `page.tsx` and every section are Server Components; anything using Motion, GSAP, ReactBits, pointer or scroll state is a `'use client'` leaf imported into the section. Continuous-value state (pointer, scroll) lives in `useMotionValue` / `useScroll` / `useTransform`, never `useState`. No `window.addEventListener('scroll')`.

## 5. Component specs

### `GlassSlabs` (port of `slabs()` in glimpse-v2)
- SVG `viewBox 0 0 560 1000`, `preserveAspectRatio="xMinYMid slice"` (left) / `xMaxYMid slice` (right), `fill="none"`.
- 7 slabs, width 52, step 34 (overlapping), lateral jog 52 at an S-bend: `bendY = 330` (left) or `640` (right), curve `C x bendY+60, x2 bendY+40, x2 bendY+110`.
- Draw order back-to-front (i = 6 → 0). Per slab, in this order:
  1. cast shadow: `#000` stroke 20, opacity .9, translated `+(w/2+7)` toward the panel centre, blur 7
  2. body: stroke `url(#g{i})` width 52; gradient is vertical with a per-slab hot band (`hi → mid → hot → hot → mid → lo`), hot band at `bendY+260+i*38` (left) / `bendY-220+i*38` (right)
  3. right-half shade: `#000` stroke 26, opacity .5, translated `+w*.28`, blur 7
  4. sheen: white vertical gradient stroke, opacity .3, CSS class `sheen` (translateY ±12% over 7s, staggered `-i*.6s`; disabled under reduced motion)
  5. specular edge: `#fff` stroke 2, opacity .9, translated `-(w/2-1)` toward the outer edge
  - group opacity `1 - (i/6)*.42`
- Behind all slabs: a bloom copy (`feGaussianBlur stdDeviation 30`, group opacity .8, stroke width 78).
- In front: a horizontal fade rect toward the panel centre (`#0b0b0d`, 0 → 1 from 45% → 100%).
- Wrapper `::before`: CSS radial glow in the slab colour, `blur(30px)`, opacity .55 (cheap bloom beyond the SVG).
- Palette per colour from §3 (`hi`, base, `lo`, plus `hot` tint: blue `#EAF2FF`, red `#FFE9E6`, yellow `#FFF8DD`, green `#E6FAEC`). `spectrum` assigns per-slab hues blue → cyan → green → yellow → orange → red.
- Performance: max two `GlassSlabs` pairs mounted with filters at once (Tracks stack renders slabs only for the active card ± 1; others show a static `<Image>` poster rendered once via `toDataURL` at build time or simply the matching export crop). Under `prefers-reduced-motion` the sheen stops; everything else is static and cheap.

### `EdgeExports` (hero)
- Per side one wrapper `.edge` (`absolute top-[-6%] h-[112%] w-[56%]`, horizontal `mask-image` fade toward centre at 55 → 100%) holding exactly **two** `<img>` (`a`, `b`). Crossfade = set the hidden one's `src` to the next export, wait for `decode()`, toggle `.on` (opacity transition 1.8s). No `will-change`. No `filter` on the wrapper.
- Auto-cycle every 6.5s (spectrum → blue → red → yellow → green), paused when the hero is off-screen (IntersectionObserver) and under reduced motion (spectrum stays).
- Pointer parallax: `useMotionValue` for px/py, `useTransform` to ±14px x / ±10px y, spring `{ stiffness: 60, damping: 20 }`. Scroll parallax: `useScroll` on the hero, edges translateY 0 → -8%.
- Exposes the active colour key through a small Zustand store (`useAccent`) so `Lockup` pill and the nav pill follow it.
- Images: `public/brand/exports/*.webp` at 1080×1350, `<img decoding="async" fetchpriority="high">` for the first pair, `loading="lazy"` for the rest is irrelevant (only two mounted). Preload the spectrum export in `<head>`.

### `Lockup`
- Inline SVG from `devfest logo.svg` with the `2026` pill `<rect>` as a `motion.rect` whose `fill` animates (`duration 1.2`). Text inside the lockup is rendered as `<text>` in Google Sans Flex (the delivered SVGs have outlined text; keep them as-is for the nav at 40px, use the inline `<text>` version for the hero at up to 400px so it stays crisp).

### `Spotlight`
- Three stacked beams, each a wrapper with `filter: blur(34/18/9px)` containing a child with the `clip-path` trapezoid (blur must be on the parent so edges soften; clip-path applies after filter on the same element). Widths 64vw / 36vw / 15vw, horizontal `mask-image` fade 40 → 60%.
- Floor: 30vh, a 3px hot line with layered box-shadow glow, and a radial-masked reflection gradient.
- `x` prop is a MotionValue in px; beams share `style={{ x }}` so the spotlight can follow the hovered speaker card with a spring.

### `Button`
- Primary: `bg-text text-[#0a0a0c]` pill, `h-12 px-6`, `whileTap={{ scale: .97 }}`, hover `bg-white`.
- Ghost: glass pill. Both: visible focus ring `outline-2 outline-offset-2 outline-blue-hi`. Labels ≤ 3 words, never wrap.

## 6. Section specs (page order)

| # | Section | Layout family | Motion (library) | ReactBits |
|---|---|---|---|---|
| 0 | **Loader** | full-bleed title sequence built from light (§7) | Motion only | `DecryptedText` |
| 1 | **Nav** | 72px, logo left (40px lockup), 5 links, "Join the waitlist" pill; becomes glass with `backdrop-blur` after 40px scroll (`useScroll` → `useTransform` opacity); mobile: full-screen menu | Motion | `StaggeredMenu` (mobile) |
| 2 | **Hero** | full-bleed `min-h-[100dvh]`, centred stack: lockup (≤400px) · h1 "One day. **Four tracks.** / Every builder in Delhi NCR." · CTAs "Join the waitlist" + "See the tracks" · bottom facts row (Date / Venue / Last year, mono labels). Edges = `EdgeExports`. Floor = `Prism` at 25% opacity, bottom-centre, pointer-reactive | headline `SplitText` chars (GSAP, once); CTAs `Magnet` | `SplitText`, `Magnet`, `Prism` |
| 3 | **Tracks** "Pick your track. **Or wander.**" | `ScrollStack` of 4 full-width glass-slab panels (each 70vh desktop): `GlassSlabs` both edges in the track colour, glyph tile from the Figma glyph sheet (`public/brand/glyphs/<glyph>.webp`), name, tagline, description, format label top-right ("Talks", "2 hack spaces", "Hands-on"; never an invented session count). Active card sets `useAccent` so the nav pill follows. Mobile (<1024px): plain stacked panels, no pin | `ScrollStack` (Lenis), `GlareHover` on hover | `ScrollStack`, `GlareHover` |
| 3b | **The floor** "…and the floor." | uniform grid of 9 glass tiles (desktop 3×3, tablet 2 cols, mobile 1 col; a catalogue grid of like items, not a feature row): glyph tile (grayscale at rest, full colour on hover/focus, like ChromaGrid), category label, title, one-line description. The two "New for 2026" tiles get a small pill badge. Data in `src/data/floor.ts` | Motion `whileInView` stagger, `whileHover y:-4` | none |
| 4 | **Stage** "Last year's stage." | full-bleed: `Spotlight` + 8 glass speaker cards in a 4×2 grid on the floor line (photo 72px round, name, role). Hovering a card springs the spotlight `x` to that card's centre; leaving returns to centre. Below grid: "2026 lineup announced soon" + no CTA (waitlist CTA is elsewhere). Mobile: horizontal scroll-snap row, spotlight static | Motion spring on `x`, cards `whileHover y:-4` | none |
| 5 | **Day at a glance** (tentative) | horizontal timeline: SVG path with 6 nodes (Doors 09:00, Keynote 10:00, Tracks 11:00, Lunch 13:00, Workshops 14:00, Closing + after-party 17:00); path `pathLength` driven by `useScroll` (0 → 1 across the section); labels fade in per node | Motion `useScroll` + `pathLength` | none |
| 6 | **The essentials** | bento, exactly 4 cells (2+2): countdown (`SplitFlapText`, days/hours/minutes), venue map (Google Maps embed iframe, dark params, `GlassSurface` address card), tickets status ("Waitlist open" + CTA), "4,400+ registered in 2025 · 70+ speakers" (`CountUp`). Two cells get quiet `GlassSlabs intensity={.4}` for background diversity | `MagicBento` spotlight | `MagicBento`, `SplitFlapText`, `CountUp`, `GlassSurface` |
| 7 | **Past partners** | one `LogoLoop` (the only marquee on the page) of real SVG logos via Simple Icons CDN (`digitalocean`, `github`, `kaggle`, `neo4j`), logos only, no labels; under it "Become a sponsor" → `mailto:noida.gdg@gmail.com` | `LogoLoop` | `LogoLoop` |
| 8 | **Final CTA** | full-bleed "See you on October 10." + "Join the waitlist"; background `PrismaticBurst` (spectrum, low intensity) | `ClickSpark` on click | `PrismaticBurst`, `ShinyText`, `ClickSpark` |
| 9 | **Footer** | lockup, nav links, socials (Instagram `instagram.com/gdg_noida`, LinkedIn `linkedin.com/company/noidagdg`, YouTube `youtube.com/@gdg_noida`, X: confirm handle, gdgnoida.com lists `twitter.com/gdg-noida`), email, "Organised by GDG Noida" → gdgnoida.com, Code of conduct link (TODO url) | none | none |

Layout-family check: gate, nav, corridor hero, scroll-stack, catalogue grid, spotlight grid, timeline, bento, logo loop, burst CTA, footer → no repeats, no zigzag, one marquee, one pinned section, zero section eyebrows.

## 7. Loader spec: the ident (21 Sep 2026; the frost, the blinds, the shelf, Convergence, Ignition and the glass-panel gate it replaced are in the git history)

Components: `components/loader/Loader.tsx` (state machine, rendered in `layout.tsx` above `{children}`), `IdentStage.tsx` (frame, captions, readout, the mark and its glide), `IdentField.tsx` (the loader's canvas), `cut.ts` (the cut's timings), `useAssetProgress.ts` (real progress as three named tasks). The picture is `components/brand/ident-field.ts`.

The idea: the Netflix title card, taken as a reference and not copied (the 2019 ident by Imaginary Forces: the N's ribbon splits into a spectrum of vertical stripes, thumbnails seen sideways like records on a shelf, and the camera flies through them). Ours: black; a line of light draws down the centre and splits into the site's spectrum of vertical stripes fanning outward, two fainter layers behind for depth; the stripes light up in the rows of the mark so the lockup builds as a barcode before the real one sharpens over it; then the whole field is pushed past the camera while the black dissolves, so the stripes fly out over the billboard's video, already playing.

Show logic:
- Plays on every load, including reloads; the one navigation it skips is a back/forward return (`PerformanceNavigationTiming.type === "back_forward"`), which is not an arrival. `?noloader=1` skips it (QA, Lighthouse comparisons); `?loader=1` forces it.
- Under `prefers-reduced-motion` the gate never paints: `.loader-gate { display: none }` in the globals.css reduced-motion block, because `useReducedMotion()` resolves after mount. The phases still run to `hide` and `finish()` fires at once.
- Progress is `useAssetProgress()`: `type` (`document.fonts.ready`), `stage` (`window.load`) and `video` (the billboard's loop reaches `canplay`, or 2.5 s pass, whichever first, so a slow line never stalls the opening). What is drawn is `min(progress, clock)`, the clock running linearly over 6.5 s from the moment the stage mounts: the loader is slow on purpose.
- While visible: body `aria-busy="true"` and `overflow: hidden`; root `role="status" aria-live="polite"` with visually hidden "Loading DevFest Noida 2026"; the stage is `aria-hidden`.
- The hero is painted under the opaque gate until the loader commits to its sequence (`useLoaderState.showing`), so the browser records the LCP at first paint; it then drops to its hidden state under the gate and enters on `finish()`. The video plays from `showing`, under the gate, so the opening lands on a moving picture (`HeroVideo` re-issues `play()` once its deferred source is attached, because `load()` pauses the element). On the skip path the hero never hides and the gate's dissolve is the entrance.

Phases: `init → show → cut → hide` (the sequence) or `init → fade → hide` (skip). No AnimatePresence: the cut runs several things on their own clocks.

The picture (Canvas 2D on a transparent canvas at device-pixel-ratio 1 over the gate's black backdrop; no image files, no WebGL, no filters, no backdrop-filter), keyed to drawn progress `p`. Three layers of stripes, front to back: 12 px wide at a 30 px pitch, 6 px at 30 offset by half, 3 px at 22; everything scaled by 0.6 below 768 px. Each stripe is dark glass in its spectrum hue by x from `slabs.ts` (`lo` at 40 %), with a hairline of white at its left edge and a hot band (`hot` core, `mid` falloff, 22 % of the height) resting at a seeded height and drifting slowly. Seeded, so a resize keeps the picture. Drawn in passes (geometry into a scratch array, bodies grouped by hue, then everything additive) so the canvas state changes a handful of times per frame.
1. **The line** (p 0.02 to 0.12). A 2 px white line draws down from the centre of the screen. Captions fade in.
2. **The fan** (0.10 to 0.45). The front stripes leave the centre line nearest first, each sliding to its rest with a long ease-out while it widens from half to full; the line hands over to them and fades. The two far layers come up behind (0.30 to 0.50).
3. **The build** (0.45 to 0.62). Left to right across the mark's box, each front stripe lights up white in the rows the mark occupies there (the mark rasterised once at its on-screen size and read column by column, the lit width the full pitch less a hairline), so the lockup appears as a barcode of light; the field brightens under it.
4. **The mark** (0.58 to 0.72). The real `{ DevFest }` lockup sharpens over its barcode, which fades out under it, with a soft glow behind.
5. **The hold** (0.72 to 1.00). The field is pushed 15 % toward the camera (the camera starting to move), the far layers less; the bands drift; the readout reaches 100.
6. **The cut** (2.2 s). The rush: the field is pushed to 7× over 0.9 s with an ease-in, each layer by its own share, stripes widening with the square root of the push, everything flaring for the first 0.35 s; the dark bodies clear between 0.15 and 0.6 s, the light between 0.3 and 0.9 s; the black backdrop dissolves from 0.25 to 0.95 s, so the stripes fly out over the video. At 0.99 s the mark glides onto the billboard's lockup (FLIP, 1.2 s, `[0.16,1,0.3,1]`), fading over its last 15%; `finish()` fires at 1.24 s so the copy rises while the mark lands; body released at 0.6 s; the gate unmounts on landing. The canvas loop stops itself 1.2 s into the cut.

Frame: three `.label` captions (`{organiser} presents`, the date, the region), hidden below `sm`, and a mono readout `047 / 100` bottom-left written straight to the DOM from the MotionValue (no renders). All fade at the cut.

Rules: transform and opacity only outside the canvas; the loader's canvas loop runs only while the stage is mounted; `Z.loader` is 55, under the film grain on purpose. Inside the canvas nothing full-screen uses a gradient fill or the bicubic filter (see §22 for the measurements).

## 8. Data shapes (with placeholder content)

```ts
// event.ts
export const EVENT = {
  name: "DevFest Noida 2026",
  date: "2026-10-10T09:00:00+05:30",
  venue: { name: "Expo Inn", address: "25-29, Knowledge Park II, Greater Noida, Uttar Pradesh 201310",
           mapsLink: "https://maps.google.com/?q=Expo+Inn+Knowledge+Park+II+Greater+Noida",
           mapsEmbedUrl: "https://www.google.com/maps?q=Expo+Inn+Greater+Noida&output=embed" },
  links: { waitlist: "https://www.commudle.com/fill-form/5096", community: "https://gdgnoida.com", sponsor: "mailto:noida.gdg@gmail.com" },
  socials: { instagram: "https://instagram.com/gdg_noida", linkedin: "https://linkedin.com/company/noidagdg", youtube: "https://youtube.com/@gdg_noida", x: "https://twitter.com/gdg-noida" /* TODO confirm */ },
  counts: { registered2025: 4400, speakers2025: 70, tracks: 5 },
};
// tracks.ts (real 2026 tracks, supplied 17 Sep 2026)
AI Overloaded (blue) "The complete agentic track: agents, harnesses, open models, evals, cloud and dev." Talks
AI ABC (green) "AnyBody Can Code: AI from first principles for devs, designers, PMs and entrepreneurs." Talks
AI × Hardware (red) "Two hack spaces. RPis on surveillance duty, bots roaming the floor, drones overhead, world models you can step into, and a robot racetrack." 2 hack spaces
Hands-on (yellow) "Gemma on Edge, the Cloud track, open source and so much more, guided hands-on learning." Hands-on
// floor.ts (9 experiences beyond the tracks)
New for 2026: Vibe-it Space, Robo Track Battle · Booth: Vibe Code / Sketch Booth · Creators: Bytes with Influencers · Podcast: Creator Studio ·
Community: Community Demos · Signature: Small Business Fair · Access: Speaker Meet & Greet · Vibes: Activities & Photo Ops
// speakers.ts (from the 2025 Commudle page; photos null until supplied → picsum seed placeholder marked TODO)
Saurabh Rajpal (Staff Web Ecosystem Consultant, Google), Joy Banerjee (VP Design, Blinkit), Shivay Lamba (GSoC Mentor, TensorFlow),
Vipul Gupta (Senior Product Engineer), Utkarsh Gupta (Principal Engineer), Tarushi Sharma (Product Manager, American Express),
Manjunath Janardhan (Principal AI Engineer), Aprajita Verma (Frontend Architect)
// schedule.ts: the six nodes in §6 row 5, flagged tentative
// sponsors.ts: digitalocean, github, kaggle, neo4j
```

Copy (final, no dashes):
- Hero h1: `One day. Four tracks.` / `Every builder in Delhi NCR.` (emphasis on "Four tracks.")
- Facts row: `Date · 10 October 2026` · `Venue · Expo Inn, Greater Noida` · `Last year · 4,400+ registered`
- Tracks h2: `Pick your track. Or wander.` (emphasis "Or wander.")
- Track copy: see `src/data/tracks.ts` (client-supplied, verbatim apart from dash removal).
- Floor h2: `…and the floor.` Floor copy: see `src/data/floor.ts`.
- Stage h2: `Last year's stage.` + `2026 lineup announced soon`
- Schedule h2: `A day at a glance` + small mono `Tentative`
- Essentials h2: `The essentials`
- Partners h2: `Past partners` · CTA `Become a sponsor`
- Final CTA: `See you on October 10.` · `Join the waitlist`

## 9. Performance rules (learned from the glimpse, non-negotiable)

- Hero edges: exactly two `<img>` per side, src-swap crossfade, no `will-change`, no `filter` animation on containers. Ten mounted 1080×1350 layers with `will-change` blacked out the compositor in testing.
- Never put `filter` and `clip-path` on the same element when soft edges are wanted; blur the parent, clip the child.
- SVG filters (`feGaussianBlur`) only inside `GlassSlabs`; at most two active slab pairs on screen; other cards use static posters.
- WebGL (`Prism`, `PrismaticBurst`) dynamic-imported, `ssr:false`, DPR ≤ 1.5, `IntersectionObserver` pause, unmounted under reduced motion (replace with the spectrum export at 30% opacity).
- Exports converted to WebP (quality 82), spectrum pair preloaded, others fetched on first cycle.
- Fonts: `next/font/local`, `display: "swap"`, `adjustFontFallback`. Only the axes used are subset (`opsz,wdth,wght,slnt`).
- Grain overlay: fixed, `pointer-events-none`, `z-[60]`, opacity .05, never on scrolling containers.
- Budget: LCP < 2.5s (LCP element = hero h1, which is text; edges are decorative and not the LCP), CLS < 0.1 (reserve hero height with `min-h-[100dvh]`, lockup has explicit `viewBox` sizing), INP < 200ms.
- `useEffect` hooks that start intervals/observers/GSAP contexts return cleanups.

## 10. Accessibility rules

- Skip link to `#main`; nav has `aria-label="Primary"`; `scroll-padding-top: 88px` on `html` so anchors clear the sticky nav.
- Every interactive element has a visible focus ring (2px, offset 2px, `--color-blue-hi`); no `outline: none` without replacement.
- Decorative SVG/images (`GlassSlabs`, `EdgeExports`, `Spotlight`, glyphs) are `aria-hidden="true"` with empty `alt`.
- Contrast: text `#f5f5f7` on `#050505` (≈19:1), muted `#9a9aa3` on `#0b0b0d` (≈7.4:1), primary button `#0a0a0c` on `#f5f5f7` (≈18:1). Ghost button text on glass over bright edges: add `text-shadow 0 1px 12px rgba(0,0,0,.6)`.
- Loader: `role="status"`, `aria-busy` on body, never blocks longer than assets actually take + the 2.6 s hold and 1 s cut, never painted under reduced motion (hidden by the stylesheet).
- All motion gated by `useReducedMotion()`; ScrollStack falls back to normal stacked flow; crossfade stops; sheen stops; WebGL unmounted.
- Touch targets ≥ 44×44px (nav links get `py-3`), speaker cards ≥ 44px tall, mobile menu items 56px.
- External links (`waitlist`, socials, maps) `target="_blank" rel="noopener"` with a visually-hidden "(opens in new tab)".

## 11. Build order (each step ends with `npm run dev` checked in the browser at 1440, 1024, 390)

1. **Scaffold**: `npx create-next-app@latest devfest2k26 --ts --tailwind --app --src-dir --eslint --import-alias "@/*"` inside `/Users/nuclear1784/devfest2k26` (use `.` as the target). Install `motion @phosphor-icons/react zustand`. `npx shadcn@latest init` (style: new-york, base colour: neutral, CSS variables: yes), add the `@react-bits` registry to `components.json`. Write `CLAUDE.md` (§13), tokens, fonts, `data/*.ts`, `Container`, `Button`, `Nav`, `Footer`, empty section shells with headings. Copy assets to `public/brand/` and `docs/reference/`. Convert PNGs to WebP (`sips` or `sharp`).
2. **`GlassSlabs` + `Spotlight`**: port from `docs/reference/glimpse-v2.html`; render a `/dev/slabs` playground route (delete before ship) showing all five colours next to the matching export until they match.
3. **Hero**: `EdgeExports`, `Lockup`, headline with `SplitText`, `Magnet` CTAs, facts row, `Prism` floor. Verify hero fits 1440×900 and 390×844 without scroll; verify scrolling the page never blacks out (the §9 rule).
4. **Loader** (§7). Verify: skipped on warm reload, skipped under reduced motion, exit hands off to hero cleanly, no scroll during.
5. **Tracks** with `ScrollStack`; verify `start: top` pinning, mobile fallback, active-card → nav pill sync.
6. **Stage** with spotlight-follows-hover; **Schedule** path; **Essentials** bento (countdown from `EVENT.date` in IST); **Partners** loop; **Final CTA** burst.
7. **Polish**: OG image, metadata (title "DevFest Noida 2026", description ≤ 155 chars), favicon from the bracket mark, 404 page, grain overlay, Lighthouse.
8. **Pre-flight** (§12) and remove `/dev/slabs`.

## 12. Verification

- `grep -rnE "—|–" src/` → no matches in user-visible strings.
- `grep -rn "uppercase" src/components/sections | grep -v facts | grep -v count | grep -v time` → 0 section eyebrows.
- `grep -rn "addEventListener('scroll'" src/` → none.
- Lighthouse (mobile + desktop) on `next build && next start`: Performance ≥ 90, Accessibility ≥ 95, LCP < 2.5s, CLS < 0.1.
- Manual: keyboard-tab the whole page; DevTools "Emulate prefers-reduced-motion"; DevTools "Emulate prefers-reduced-transparency"; throttle to Fast 3G and confirm the loader shows real progress and hero images arrive without layout shift; scroll through Tracks at 1024 and 390.
- Visual: side-by-side screenshot of `GlassSlabs color="green"` vs the green export; hero at 1440×900 matches `docs/reference/glimpse-v2.html`.
- Links: waitlist opens `https://www.commudle.com/fill-form/5096` in a new tab; sponsor mailto works; socials resolve (X handle flagged TODO).

## 13. Project `CLAUDE.md` (write verbatim in step 1)

```md
# DevFest Noida 2026 site

Design-led event landing page for GDG Noida. Next.js App Router + Tailwind v4 + Motion + ReactBits. Dark only.
Full spec: docs/SPEC.md (copy of the approved plan). Reference glimpse: docs/reference/glimpse-v2.html. Brand assets: public/brand/.

## Rules
- Server Components by default; `'use client'` only on motion/pointer/scroll leaves.
- Motion (`motion/react`) for UI; GSAP only inside ReactBits SplitText; never both on one element.
- Continuous values (pointer, scroll) use MotionValues, never useState. No window scroll listeners.
- Hero edges: two <img> per side, src swap, no will-change, no filter on containers.
- Blur on parent, clip-path on child.
- WebGL only via next/dynamic ssr:false, DPR ≤ 1.5, paused off-screen, unmounted under reduced motion.
- All content lives in src/data/*.ts. Never hardcode event facts in components.
- Copy: sentence case, no em/en dashes, one label per CTA intent ("Join the waitlist").
- Tokens only from globals.css @theme. Radius: panels 24, cards 20, buttons pill. Icons: Phosphor regular.
- Every animation honours useReducedMotion(). Loader is skipped under reduced motion.
- Before claiming done: run the §12 checks in docs/SPEC.md.

## Commands
npm run dev · npm run build · npm run lint · npx shadcn@latest add @react-bits/<Name>-TS-TW
```

## 14. Open items (flagged, not blocking)

- X/Twitter handle: gdgnoida.com lists `twitter.com/gdg-noida`; confirm.
- Speaker photos, venue photo, 2026 lockup variants, and a code-of-conduct URL to be supplied; slots are marked `TODO` in data files.
- Registration: waitlist form now; swap `links.waitlist` when tickets open.

---

## 15. Build log: deviations from the plan and why (18 Sep 2026)

- **Tracks are 4, plus "The floor" (9 items).** Supplied by the client mid-build; `src/data/tracks.ts` and `src/data/floor.ts` are the source of truth. Track marks and floor tiles are cut from the Figma glyph sheet (`public/brand/glyphs/*.webp`, 25 tiles), not stock images.
- **Fonts: Google Sans Flex ships with the `wdth` axis only.** `opsz` + `slnt` made the latin file 514 KB; `wdth` alone is 116 KB and is the axis the emphasis relies on. Both fonts come from `next/font/google` (Next 16 includes them), not self-hosted files.
- **`MagicBento` was not used.** The ReactBits component hardcodes its own card content. `Essentials.tsx` has a small `Cell` with a pointer-tracked spotlight instead.
- **`StaggeredMenu` was not used.** The mobile menu is a Motion `AnimatePresence` overlay in `Nav.tsx`; fewer moving parts.
- **ScrollStack runs desktop-only (≥1024px) and never under reduced motion.** It drives the window with Lenis, so it is only mounted where the stack is shown. Its inner wrapper's hardcoded `pt-[20vh] px-20 pb-[50rem]` and the card's fixed `h-80 rounded-[40px]` were removed (layout only; motion logic untouched).
- **`GlassSlabs` exposes `bloom` (static) and `sheen` (animated) separately.** Track panels use bloom only, so four stacked cards do not repaint SVG filters every frame. The wrapper also carries a CSS mask so the inner edge fades even when the SVG is cropped.
- **`GlareHover` needs an opaque `background` prop.** Its inline style overrides Tailwind classes; passing `background="transparent"` made stacked cards see-through.
- **Below-the-fold sections mount through `LazyMount`** (IntersectionObserver, 800px margin, reserved `minHeight`). The anchor ids live on the wrappers so nav links work before the sections mount. This took mobile TBT from 440 ms to 30 ms.
- **Hero WebGL (`Prism`) is desktop-only and mounts 1.5 s after the loader hands off.** Shader compilation was stalling first paint on throttled devices.
- **The headline is always in the DOM.** Plain text renders from the first byte for LCP; `SplitText` (dynamic import, GSAP) replaces it once the loader is done. The `h1` carries `aria-label`; GSAP is told `aria: 'none'` so it does not put `aria-label` on plain spans (axe: aria-prohibited-attr).
- **Logo loop has no links.** LogoLoop clones its list with `aria-hidden`, and focusable links inside would fail axe (aria-hidden-focus).
- **`?noloader=1`** skips the loader (QA and Lighthouse comparisons).
- **ESLint** relaxes only style rules for `src/components/reactbits/**` (vendored code); everything else lints clean.

### Lighthouse (production build, headless Brave, 18 Sep 2026)

| | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Desktop | 98-99 | 100 | 100 | 100 | 1.0-1.1 s | 0-0.05 | 0 ms |
| Mobile (slow 4G, 4x CPU) | 91 | 100 | 100 | 100 | 3.5 s | 0.04 | 30 ms |

Mobile LCP is the hero edge image; the remaining delay is hydration on a throttled CPU. Real mid-range phones on 4G land well under 2.5 s.

### Still open (needs client input)
- Speaker photos (`photo: null` renders initials), venue photo, code-of-conduct URL, X handle confirmation.
- Registration link swap when tickets open (`EVENT.links.waitlist`).
- **Reduced-motion fix (post-commit):** Motion `animate` targets must always be defined. The server renders the hidden `initial` styles (it cannot know the user's preference), so an `animate: undefined` under reduced motion left the nav and hero copy invisible. Now `animate` always has a target and `transition` collapses to `{ duration: 0 }` when reduced motion is on. Verified with `--force-prefers-reduced-motion` in headless Brave.
- **Anchor navigation with lazy sections:** `AnchorFix` re-aligns the hash target for 1.6 s after any hash change while the document grows (sections above the target mount and push it down). Placeholders are also sized at or above real content height; overestimates never show because a placeholder is replaced before it reaches the viewport.

---

## 16. Smoothness pass and section rework (18 Sep 2026)

Client review of the first build: "the animations are not smooth at all", the Tracks
card stack "glitching so much", the Stage spotlight not smooth, "not focused" and
washing out the speaker names, frame rates dropping site-wide, the hero not using
ReactBits and not distinctive, the floor section "ridiculous", and the nav logo too
small. This section records what was actually wrong and what replaced it.

### What was costing frames

| # | Cause | Where it was |
|---|---|---|
| 1 | Lenis drove the whole window from mid-page and fought `html { scroll-behavior: smooth }` | ReactBits `ScrollStack`, mounted by Tracks |
| 2 | Every card re-measured with `getBoundingClientRect` on every frame, then rescaled | same |
| 3 | ~120 live SVG blur-filter regions in the stack (2 `GlassSlabs` per card), re-run whenever a card scaled | `GlassSlabs`, `TrackPanel` |
| 4 | Full-viewport `mix-blend-overlay` grain, forcing a re-blend against the page on every repaint | `layout.tsx` |
| 5 | ~25 `backdrop-filter` panels, most over a flat canvas where the blur did nothing visible | `.glass` |
| 6 | `Prism`: a 100-step raymarch at DPR 2, restarted by any `pointermove` anywhere, on or off screen | hero floor |
| 7 | `PrismaticBurst` at DPR 2 | final CTA |
| 8 | Three 64vw beams with live `filter: blur()` + masks, all moving on a spring | `Spotlight` |
| 9 | `Magnet` running `window.mousemove` → `setState` with the hero off screen | hero CTAs |
| 10 | Always-on rAF loops (ShinyText repainting a 7rem `background-clip: text` heading off screen) | final CTA |

### What replaced them

- **Tracks now use native `position: sticky`** (`TrackStack.tsx`). Cards pin at 12vh,
  stepping 24px each, with a higher `z-index` per card so later cards cover earlier
  ones. One `useScroll` on the section drives every card's shrink through
  `useTransform`; nothing measures the DOM on scroll. Lenis and `ScrollStack.tsx` are
  gone, and `lenis` was uninstalled.
- **Slabs render as posters.** `src/components/brand/slabs.ts` holds the geometry and
  emits the SVG; `scripts/render-slabs.mts` rasterises one WebP per colour/side into
  `public/brand/slabs/` (`npm run slabs`, ~40 KB each). `GlassSlabs` takes
  `poster` (default true) and keeps the live filtered SVG for any future use of the
  sheen. Node's own type stripping runs the script, so there is no ts-node/tsx dep.
- **`.glass` is solid; `.glass-live` is the one that blurs**, and it carries the whole
  recipe so a panel can never end up with a blur and no surface. `.glass-pill` is the
  pill variant. Only the venue card (over the map) and the mobile menu blur now.
- **WebGL glows run at DPR 1.** `Prism` is gone; the hero floor is ReactBits
  `LightRays` (`RaysFloor.tsx`), tinted by the active track and pausing itself
  off-screen. `PrismaticBurst` capped at 1.
- **Grain lost `mix-blend-overlay`.** Pointer listeners in the hero (`Magnet`,
  `EdgeExports` parallax) are gated on `useInView`; `ShinyText` is disabled off-screen.

### Hero: "light parts for you"

The loader's hand-off now opens the hero: the two lit edges slide apart from the
centre (`EdgeExports`, 1.6s). The headline uses ReactBits `VariableProximity` on
Google Sans Flex's own width axis, so letters swell toward the cursor; it is plain
text under reduced motion, on touch, and until the loader is done, so the LCP text is
never blocked. Four track dots in the facts row preview a track: hovering one sets the
shared accent, which recolours the edges, the lockup pill and the floor rays, and
pauses the auto-cycle (`hold` in `lib/accent.ts`). `SplitText` and GSAP left with it.

### Stage

The beam is one pre-rendered texture (`public/brand/spotlight/cone.webp`, same
script), moved only by the existing spring. It is anchored to the card row and reaches
up above it, so the light **lands on the speakers** and pools just under them
(`SpotlightPool`) instead of running past them to a hot line a third of a viewport
below. Cards are solid (`!bg-surface/85`), the hovered card lifts to full brightness
with a warm rim and the rest dim to 0.6, and a static vignette keeps the room dark.

### Floor

Was nine identical cards in a 3×3 grid. Now a bento: the two "New for 2026" items lead
as features (badge, large bleeding glyph, `lg:col-span-3`), six standard tiles follow
(`lg:col-span-2`), and the photo-ops item closes it as a full-width banner. Each tile
carries one of the four brand colours, shown on hover as an edge wash, a border tint
and a soft glow.

### Nav

ReactBits `PillNav` (GSAP: a circle fills each pill from the bottom while the label
swaps) supplies the links, hamburger and mobile popover. Patched for this project:
`react-router-dom` dropped (every link here is a hash anchor, which upstream already
routed to a plain `<a>`), and `logo` takes a ReactNode so the real lockup can be used.
The lockup is 150px wide (128px on mobile), up from 104px, and the header is 84px tall
with `scroll-padding-top: 104px` to match. `gsap` is back as a dependency for it;
`@gsap/react` is not.

### Two hydration bugs found and fixed during this pass

`useReducedMotion()` resolves after mount, so a Motion `initial`/`animate` **value**
that branches on it renders one thing on the server and another on a client whose OS
already prefers reduced motion. That is a hydration mismatch, and it only shows in dev
(production React does not warn), which is why the earlier `next start` verification
missed it. Both sites are fixed and the rule is in CLAUDE.md: only `transition` may
branch on `reduce`; state that feeds an animate value gets gated in the handler.

### Measurements (this machine, production build, Playwright Chromium)

| | Performance | A11y | Best practices | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|
| Desktop | 94 | 100 | 100 | 100 | 1.0 s | 0 | 100 ms |
| Mobile (Lighthouse default throttling) | 86 | 100 | 100 | 100 | 4.1 s | 0 | 10 ms |

Not directly comparable with the 18 Sep figures above: that run was on a different
machine with nothing else on it, this one shared a CPU with a dev server and a browser
harness. The LCP subparts are the useful number here: TTFB 9ms, load delay 5ms, load
9ms, render delay 151ms, so the hero edge image itself is not slow. Re-run Lighthouse
on the reference machine before trusting the absolute scores.

### Still open from this pass

- The `VariableProximity` swell has only been checked in screenshots, not with a real
  cursor on a real display; watch for line reflow at the largest clamp size.
- Lighthouse desktop moved 98-99 → 94 and mobile 91 → 86 on a noisy machine. Worth one
  clean re-run before the next handover.

---

## 17. Empty stretches, centred nav, venue TBD (19 Sep 2026)

Client review after the smoothness pass: several stretches "feel empty", the nav
should sit in the middle without its CTA, and the venue is now TBD.

### The voids were spacing, not missing content

Measured at 1040px tall, before: Tracks to Floor **590px** (`TrackStack`
`lg:pb-[26vh]` 270 + `lg:pb-40` 160 + `lg:pt-40` 160), Schedule to Essentials
**320px**, Stage to Schedule **347px**. `lg:py-40` is art-gallery spacing; this page
sits at a density that wants `py-16`-`py-24`.

Section rhythm is now `py-20 md:py-24 lg:py-28`, the Tracks stack's trailing hold is
`lg:pb-[12vh]` and Stage's is `h-[12vh]`. Measured after: Tracks to Floor **371px**,
Floor to Speakers **224px**, Schedule to Essentials **224px**, Essentials to Partners
**264px**.

No filler band was added between sections. The page already spends its one-marquee
budget, and ReactBits `GradualBlur` was rejected for the boundaries: it stacks five or
more `backdrop-filter` layers over scrolling content, recomputed every frame, which is
the cost class section 16 removed.

### Nav

Header is a three-column grid so the pills centre on the viewport rather than on the
space beside the lockup; `PillNav`'s wrappers are `display: contents` so the pill bar
and the hamburger land in their own columns without touching its GSAP. Height 84px to
76px, `scroll-padding-top` to 96px. The right-hand CTA is gone at the client's
request: the mobile menu still carries it, and the hero and final CTA carry the
intent, but there is now no persistent conversion path on desktop once the hero
scrolls away. `useActiveSection` (one IntersectionObserver, no scroll listener) drives
`activeHref`, so the current section's pill is marked.

### Venue TBD

`EVENT.venue` is now `{ status, label, region }`. The name, address, maps link and
embed are gone until it is confirmed, and every surface follows that one object: hero
facts row, footer, page description, and Essentials. The `#venue` anchor and the nav
label are unchanged so links still work. The page description also said "five tracks"
where the data and the hero both say four; fixed.

### Essentials, rebuilt around the empty state

Removing the map left three items in a grid shaped for four, and Floor owns the bento
family, so the section changed family instead of growing an empty cell. It is a stat
band now: the countdown full width as the anchor, then three hairline-divided blocks
with no card boxes. The venue block states what is known, what is not, and that the
waitlist hears it first, which turns the gap into the reason to act.

### Schedule

Content is unchanged (the six factual slots). Presence comes from large mono times, a
Phosphor glyph per slot driven by the `kind` field that was already in the data and
unused, and a pipe with real weight whose nodes light as the fill passes.

**The pipe's gradient had never once rendered.** `<linearGradient>` defaults to
`gradientUnits="objectBoundingBox"`, and a horizontal line has a zero-height bounding
box, so the gradient degenerated and painted nothing; the line had always been the
grey track alone. Fixed with `userSpaceOnUse` and separate horizontal and vertical
gradients.

### Partners

`LogoLoop` removed. Four logos is not the "many things that need no individual
attention" case a marquee is for, and looping them was what made the section read as
filler. Now a static row at a larger size beside a sponsor panel, so the section's one
conversion element has a home. `npx shadcn@latest add @react-bits/LogoLoop-TS-TW`
restores the loop if more logos arrive.

### ScrollReveal, with two patches

Added for the Floor intro, which now resolves word by word as the section opens.
Patched twice, documented in the file: `as` for the wrapper element, because upstream
hardcodes `<h2>` and would have put a second heading in a section that has one; and
scoped cleanup, because upstream's `ScrollTrigger.getAll().forEach(kill)` tears down
every trigger on the page. Always used with `enableBlur={false}`: its default scrubs a
filter per word on scroll.

### Reduced motion

Scroll-linked reveals resolve to their finished state through the globals.css
`prefers-reduced-motion` block (`.schedule-slot`, `.schedule-pipe`) rather than a JS
branch on `useReducedMotion()`, which resolves after mount and would differ between
the server's render and a client that already prefers reduced motion. Verified: all
six schedule slots at opacity 1 under `reducedMotion: "reduce"`.

### Still open

- No persistent desktop CTA between the hero and the final CTA, by request. A button
  that fades in past the hero would close that if it is missed.
- Partners will look right once there are more than four logos; the data file takes
  them by slug.

## 18. Convergence loader (19 Sep 2026)

The glass-panel loader (a 320×200 widget with four pills, a shimmer and three blurred discs) was replaced twice in one day. The first replacement, "Ignition", staged the moodboard's horizon of light around the lockup; the client's reaction was that it leaned on images and the logo rather than being a loader of its own, and asked for something custom, unique and code-drawn, with the lockup only at the very end. The second, "Convergence", is what shipped. Spec in §7.

- **A picture with a story.** Streaks of light in the four track colours flow like night traffic across Delhi, are pulled inward, and trace the DevFest mark: every builder in Delhi NCR converging on one day. Only then does the real lockup sharpen over the light and glide into the hero, landing within 0.02 px (measured, rAF-sampled rect against the hero's).
- **Nothing here is an image.** The field is Canvas 2D; targets are sampled from the lockup's own path data (`lockup-paths.ts`, also what the static `Lockup` renders); colours come from the slab palette. No WebGL (shader compile stalls first paint), no filters, no ReactBits component in the loader.
- **Progress is honest and paced.** Drawn progress is `min(real, clock)`. With the hero image delayed 4 s the picture parks in the flow phase at one third (the load event also waits on that image) and the readout with it; the pull and the cut run when it arrives.
- **Kept from the earlier passes:** the phase machine, the reduced-motion gate hidden by the stylesheet, the hero painted under the gate for LCP, the accent auto-cycle gated on `done`, `Z.loader` under the grain, `EVENT.organiser`, and `?loader=1`.
- **Removed:** `IgnitionStage`, `LockupReveal`, the vendored `DecryptedText` (no longer used) and the `.loader-breathe` keyframes.
- **Thicker streams, slower convergence** (client feedback after seeing it: "WOW just WOW", then "increase the thickness of the streams and make convergence more smooth and little slow"). Cores 1.5 to 3.4 px, hold 3.6 s, the pull from 0.4, gentler attraction and swirl, velocity blend 0.085.
- **Plays on every load** (follow-up the same day). The original once-per-session rule plus the 300 ms fast-cache skip meant that on localhost or a Vercel edge the loader never showed at all, which the client read as broken. Now only a back/forward return and reduced motion skip it.

### Measurements (production build, Playwright Chromium, 19 Sep 2026)

| Check | Result |
|---|---|
| Hand-off delta, loader lockup vs hero lockup, 1440 and 390 | 0.00 px left, top and width, 0.01 px height |
| Gate under reduced motion, first 20 rendering frames | `display: none` on every frame; stage never mounted; hero at opacity 1 within 250 ms |
| Warm reload | gate gone in about 0.8 s including navigation; stage never mounted |
| Hero image delayed 4 s | readout parked at 033 in the flow phase; pull, trace and cut run when it arrives; gate gone at 6.5 s |
| Lighthouse desktop, default / `?loader=1` | 100 / 99, LCP 0.8 s in both (the hero is painted under the gate) |
| Lighthouse mobile, `?loader=1` | 87, LCP 4.0 s from the hero edge image, same band as before the loader work (86) |
| Console and page errors across every run | none (two headless-Chromium WebGL driver notices from the hero rays, not page errors) |
| Cold-visit cost | max(assets, 3.6 s) + 1.5 s cut, on every load |

## 19. Light, drawn in code: the hero wall and the marks (20 Sep 2026)

Client feedback with a phone screenshot of a track card: the icons and the blue gradient (and the other colours) did not look good, and the hero's photos on either side looked ridiculous on desktop; they asked for something unique and custom, in code, inspired by the Figma glass bars. This supersedes §5 `EdgeExports`, the `GlassSlabs`/poster rules in §9 and §15, and the glyph crops.

- **What was wrong.** The track icon was a 64/96 px crop of the rainbow glyph sheet with no treatment; the "blue gradient" was the hero's slab poster reused on both sides of every card and twice more in Essentials; and on a 1920 screen the two 1080×1350 exports became wallpaper strips with a hole between them. Mobile LCP was that image.
- **One primitive.** Every cell on the glyph sheet is the same object as the hero bars: a bundle of parallel light tubes bent into a shape. `LightPipe` (`src/components/brand/LightPipe.tsx`, shapes in `pipes.ts`) draws that in one track colour at any size: translated copies of a base path, each a wide low-opacity glow stroke, a gradient body, a nudged shade and a specular edge. No image, no filter. Tracks use s-wave, arc, x, cross; the Floor the other nine (`plus` became `corner` so no shape repeats across sections).
- **The hero is `LightWall`.** Bundles of five glass bars across the full width, dark glass between bundles, one spectrum hue per bundle from blue to red, so a wider screen gets more bundles rather than a stretched picture (7 bundles at 1440, 9 at 1920, 2 at 390). Each bar is DOM: a body gradient that is dark glass except a window of light around its band, a static S-jog cut with clip-path, specular and shade per segment, a crossfading tint pair for the active track, and the hot band with a box-shadow bloom. Jogs and bands staircase down inside each bundle like the exports. Behaviour: ignition outward from the centre on the loader hand-off; the bands breathe (`band-drift`); on a fine pointer the bars near the cursor brighten and slide their light toward it (spring + per-bar `useTransform`, gated on the hero being in view); the wall tints to the hovered or cycling track (`useAccentCycle` in `lib/accent.ts`); three depths parallax on scroll; a horizontal mask keeps the middle calm for the headline. `RaysFloor`/`LightRays` (WebGL) went with the edges.
- **Track cards.** No posters, no glyph image, no `GlareHover`. An opaque panel with a hairline of the track colour along the top, index and tagline, title, description and format on the left, the track's pipe large on the right over a static bloom; `min-h-[56vh]` instead of 70vh. The pulse of light (`pipe-run`) runs through the pipe on the card the stack holds on top, the only paint-animated layer in the section.
- **Floor and Essentials** use the same marks (48 px chips, 240 px feature corners; one mark per Essentials panel), so the hero's picture no longer repeats.
- **Retired:** `EdgeExports`, `RaysFloor`, `GlassSlabs`, `LightRays`, `GlareHover`, 47 image files under `public/brand/` (exports, glyphs, slabs, sheet, moodboard; references stay in `docs/reference/`), the slab half of the render script (now `npm run spotlight`), the spectrum preload, and the loader's `light` task.

## 20. The shelf and the billboard, branch `idea/netflix` (20 Sep 2026)

Third designer round: a reel of vertical light stripes ("quite near, but this kind of animation in the loader") and a Netflix title page ("text on left and video playing in the bg"). Built on its own branch beside `idea/prism` so the client can compare previews; `main` untouched.

What shipped: `spectrum-field.ts` (the bars, drawn in passes), `SpectrumStage.tsx` and `SpectrumField.tsx` (loader), `cut.ts`, `HeroVideo.tsx` and the billboard layout in `Hero.tsx`, `EVENT.hero` (description line and video paths), a `video` task in `useAssetProgress`, `scripts/encode-hero-video.sh` and `public/video/` (1080p 16.9 MB, 720p 6.1 MB, posters 32 KB and 18 KB; the 104 MB source stays in the gitignored `docs/reference/video/`). Deleted: `LightWall.tsx`, `Convergence.tsx`, `ConvergenceStage.tsx`, the `band-drift` keyframes. §7 above is the loader spec.

The loop: five segments of the 2025 aftermovie joined with hard cuts (0:07 to 0:17, 0:22 to 0:39, 0:48 to 0:51, 1:00 to 1:10, 1:15 to 1:21), 46 s, 25 fps as shot, H.264 with a bitrate ceiling, no audio track by the client's choice. If this idea wins, the two MP4s move to Vercel Blob or an R2 bucket and only `EVENT.hero.video` changes.

Frame cost: the first cut of the renderer drew 890 bars with three compositing changes each and ran the push at 21.6 ms mean with 40 frames over 33 ms. Rewritten into passes (geometry into a scratch array, then bodies, whites, bands, speculars, alpha through `globalAlpha`, 530 bars at 1440), the push measures mean 16.67 ms, p95 16.70, max 16.80, 0 over 33; a 3 s pointer sweep over the playing hero is the same. Lighthouse (production build, `?noloader=1`): mobile performance 91, accessibility 100, LCP 3.5 s on the headline, CLS 0, TBT 0 ms; desktop 100 / 100, LCP 0.8 s. Prism, for comparison, sits at 92 / 100 mobile and 100 / 100 desktop. Reduced motion and Save-Data both show the poster only and request no video; zero console or page errors in every run.

## 21. Blinds over the video, and a lighter video (21 Sep 2026)

Client feedback on the shelf: the thin strips looked bad; they wanted thick strips with spacing, made of frosted glass, giving glimpses of the video running behind, and a slower, cinematic loader. Separately the site lagged on their Mac mini.

What shipped: `blinds-field.ts`, `BlindsStage.tsx`, `BlindsField.tsx` (the shelf files deleted), a 6.5 s hold and a 2.2 s cut, `useHeroView`, the HEVC files and the `canPlayType` pick in `HeroVideo`, the video pausing at half the hero instead of a tenth, and the nav's scrolled glass switching to a solid ground while the moving picture is under it. §7 above is the loader spec.

Why the frost costs nothing: the current video frame is copied once per frame into a buffer at 1/10 scale and each strip stretches its own column back up. No `backdrop-filter` anywhere; the un-frost runs the buffer's scale continuously to 1/2 and stops there, because a full-size copy per frame was the one thing that dropped frames in the first cut of the renderer (8 frames over 33 ms in the cut, then 2, then 1 after capping the scale and using the cheap filter once the buffer is large).

The video, measured rather than guessed: SSIM of every encode against a near-lossless copy of the same 46 s loop. H.264 1080p (16.9 MB, bitrate-capped) scores 0.9850; HEVC scores 0.9862 at CRF 26 (14.1 MB), 0.9825 at 28 (10.3 MB), 0.9792 at 30 (8.0 MB), so the like-for-like setting is CRF 26.5. H.264 720p (6.1 MB) scores 0.9714; HEVC 0.9804 at 28 (6.3 MB), 0.9742 at 30 (4.8 MB), 0.9688 at 32 (3.8 MB), so CRF 31. Finals, encoded from the source with the slow preset: 1080p 13.3 MB at 0.9857 (above the H.264 file it replaces as first choice, 21 % lighter); 720p 4.5 MB at 0.9740 (above 0.9714, 26 % lighter). Centre crops of both files at 0:03, 0:20 and 0:40 were compared side by side and are indistinguishable. The H.264 files stay as the fallback, unchanged. On this footage (crowds, confetti, camera moves) HEVC saves about a quarter at equal quality, not the half the folklore promises; the larger win for a weak machine is hardware decode and the removal of blur over the moving picture.

Frame cost (production build, Playwright Chromium, 1440×900): the blinds arriving, mean 16.67 ms, p95 16.70, max 16.80, 0 over 33; the cut (un-frost, widen, backdrop dissolve, glide and the copy's entrance together), mean 16.77, p95 16.80, max 33.40, 1 frame over 33 in 159; a 3 s pointer sweep over the playing hero, mean 16.67, max 16.80. Reduced motion and Save-Data show the poster only and request no video; the nav has no backdrop-filter at 120 px of scroll with the hero in view and `blur(24px)` once it is gone; the video is paused at 60 % scroll. Lighthouse (production build, `?noloader=1`): desktop 100 performance / 100 accessibility, LCP 0.8 s; mobile 88 / 100, LCP 3.9 s simulated on the headline, CLS 0, TBT 0 ms. The mobile figure was 91 on the shelf build; every real input to the simulation (document size, the 17 requests before the LCP, the JS total, the main-thread tasks, the observed paint at 32 to 84 ms) is identical between the two reports, and deferring the video source until fonts are ready and the thread is idle (kept, it is right on a slow line regardless) did not move it. The shelf commit itself, rebuilt and measured again the same afternoon, also reads 88 / 3.9 s, so the three points are the measuring environment, not this round.

## 22. The frost: the Netflix rods over the fogged video (21 Sep 2026)

Client feedback on the blinds, verbatim in spirit: "NOOO, I wanted something like: while we keep the loading animation Netflix-like, it will be somewhat blurred and we will be able to glance what is happening behind. Not this." The black windows were the wrong reading of "glimpses of the video"; the picture they had described was the light-stripe animation kept, in front of the whole video seen through frosted glass.

What shipped: `frost-field.ts`, `FrostStage.tsx`, `FrostField.tsx` (the blinds files deleted); the same 6.5 s hold and 2.2 s cut; the backdrop now fades at the start of the cut (the canvas is opaque throughout); and a fix in `HeroVideo`: `load()` pauses a media element, so the `play()` the loader had triggered before the deferred source arrived was lost and the loop sat on its first frame until `finish()`. It now keeps an `attached` state and plays as soon as the source is in. §7 above is the loader spec.

Where the frames went, measured in the live page with a flush after each batch (headless Chromium, so software raster; the ratios are what matter): a full-screen blit costs 2.6 ms whatever its source; the same blit with `imageSmoothingQuality: "high"` costs 14.2; a full-screen gradient fill 3.45; a lighter blit of a 600 px band 6.0; eleven glow blits three rod-widths wide 3.0; eleven rounded clips 0.02. The first cut of the renderer did all of those at full size and ran at a 31 ms mean during the fan. The renderer now composes the fog, its dim and shade, the light pass, the rods' glows and the mark's glow in the 1/3 buffer (all those costs divide by nine), upscales once with the bilinear filter, and draws only the rods' crisp bodies at full size: a column blit, three fills and two small lighter blits each.

Frame cost after that (production build, Playwright Chromium, 1440×900, the video playing under the loader this time): the fan, mean 16.67 ms, p95 16.70, max 16.80, 0 over 33 in 184; the cut (fly-through, clearing, backdrop fade, glide and the copy's entrance together), mean 16.67, p95 16.70, max 16.80, 0 over 33 in 160; a 3 s pointer sweep over the playing hero, mean 16.67, max 16.80. Reduced motion and Save-Data show the poster only and request no video; the nav has no backdrop-filter at 120 px of scroll with the hero in view and `blur(24px)` once it is gone; the video is paused at 60 % scroll and resumes on return. Lighthouse was not re-run: the `?noloader=1` path changed by one piece of state in `HeroVideo` and nothing that loads.

A note on the blinds' numbers in §21: they were taken with the video paused under the loader (the `load()` bug above), so the frost is the first loader measured with the picture actually moving.

## 23. The ident: the Netflix stripes, on black, opening onto the video (21 Sep 2026)

Client feedback on the frost: "remove the glimpse thing, masking window thing. Take full-on inspiration from Netflix, just keep thin but not too thin strips, and then open the hero where the video is already showing." So the fog went, and the loader is the shelf's idea done at a readable thickness and with the Netflix structure kept whole: line, split, fan, build, rush.

What shipped: `ident-field.ts`, `IdentStage.tsx`, `IdentField.tsx` (the frost files deleted); the same 6.5 s hold and 2.2 s cut; the backdrop dissolving under the rush (0.25 to 0.95 s) so the stripes fly out over the video, which has been playing under the gate since `show`. Stripe widths: 12 / 6 / 3 px at pitches of 30 / 30 / 22 (the shelf's were 4.5 / 2.5 / 1.5 at 7 / 8 / 10, which the client called too thin; the blinds' 56 and the frost's 26 to 46 too thick). About 48 front stripes at 1440, 22 at 390. §7 above is the loader spec.

Frame cost (production build, Playwright Chromium, 1440×900, the video playing under the loader): the fan, mean 16.67 ms, p95 16.70, max 16.80, 0 over 33 in 184; the cut (rush, backdrop dissolve, glide and the copy's entrance together), mean 16.67, p95 16.80, max 16.80, 0 over 33 in 160; a 3 s pointer sweep over the playing hero, mean 16.67. Reduced motion and Save-Data unchanged (poster only, no video request). Lighthouse not re-run: nothing on the `?noloader=1` path changed.
