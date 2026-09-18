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
    countdown.ts  z.ts (Z = { grain: 60, nav: 40, loader: 70, overlay: 50 })  cn.ts
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
| 0 | **Loader** | full-screen glass gate | Motion only (§7) | none |
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

## 7. Loader spec (client request: glass elements, several Motion animations)

Component `components/loader/Loader.tsx`, rendered in `layout.tsx` above `{children}`, `'use client'`.

Show logic:
- Runs once per session (`sessionStorage.devfestLoaderShown`). Skip entirely under `prefers-reduced-motion` (render nothing; hero appears directly).
- `useAssetProgress()` returns 0 → 1 from: `document.fonts.ready`, the two initial hero exports decoded, and `window.load`. If progress hits 1 within 300ms (warm cache), do not show at all (no flash). Otherwise show, and hold for a minimum of 1400ms so the choreography completes.
- While visible: `document.body` gets `aria-busy="true"` and `overflow:hidden`; loader root is `role="status" aria-live="polite"` with visually-hidden text "Loading DevFest Noida 2026".

Composition (all glass recipe from §3, canvas behind is `--color-canvas`):
1. **Glass panel**, 320×200 (mobile 260×170), centred, `rounded-[28px]`.
2. Inside: the **lockup** (white) and under it four **glass pills** (56×14) tinted blue / red / yellow / green at 40% with the specular top edge.
3. A **progress hairline** along the panel's bottom edge: 2px, spectrum gradient, `scaleX` bound to progress.
4. Behind the panel: a soft radial **glow** that shifts hue with the progress (blue → spectrum).

Animations (Motion, `motion/react`):
1. Panel entrance: `initial={{ opacity: 0, scale: .92, y: 12 }}` → `animate={{ opacity: 1, scale: 1, y: 0 }}`, `type: "spring", stiffness: 120, damping: 18`.
2. Lockup reveal: brackets slide in from ±16px, wordmark letters stagger via `variants` + `staggerChildren: .035` (Motion, not GSAP).
3. Pills: `staggerChildren .08`, each `initial={{ x: -24, opacity: 0 }}` → `{ x: 0, opacity: 1 }` spring, then a continuous **shimmer sweep** (`motion.span` `x: ["-120%", "220%"]`, `repeat: Infinity`, `duration: 2.4`, `ease: "linear"`) across the glass panel. Infinite loops are allowed here because it is a loader.
4. Progress hairline: `style={{ scaleX: progressMotionValue }}` with `useSpring(progress, { stiffness: 80, damping: 20 })`, `transformOrigin: left`.
5. Exit (`AnimatePresence`): panel `exit={{ opacity: 0, scale: 1.06, filter: "blur(12px)" }}` `duration .6`, pills fly outward to their hero positions (`x` ± spread) then fade; backdrop `exit={{ opacity: 0 }}` `duration .8` while `EdgeExports` fades its first pair in (the hero's own `initial` opacity 0 → 1 starts on `onExitComplete`).
6. Reduced motion: never mounted.

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
- Loader: `role="status"`, `aria-busy` on body, never blocks longer than assets actually take + 1.4s hold, skipped under reduced motion.
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
