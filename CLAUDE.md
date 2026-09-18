@AGENTS.md

# DevFest Noida 2026 site

Design-led event landing page for GDG Noida. Next.js 16 App Router + Tailwind v4 + Motion + ReactBits. Dark only.
Full spec: docs/SPEC.md (copy of the approved plan). Reference glimpse: docs/reference/glimpse-v2.html. Figma originals: docs/reference/figma/. Brand assets: public/brand/.

## Rules
- Server Components by default; `'use client'` only on motion/pointer/scroll leaves.
- Motion (`motion/react`) for all UI motion we author. GSAP appears only inside a vendored ReactBits component that ships with it (currently `PillNav`); never hand-authored, and never on the same element as Motion.
- Continuous values (pointer, scroll) use MotionValues, never useState. No window scroll listeners. No Lenis or other scroll-hijacking library: sections that pin use native `position: sticky` and read progress with `useScroll`/`useTransform` (see Tracks/`TrackStack.tsx`).
- A Motion `initial`/`animate`/`while*` **value** must never branch on `useReducedMotion()` directly (it resolves after mount and can differ between the server's render and a client whose OS already prefers reduced motion, which is a hydration mismatch). Only `transition` may branch on it (`transition={reduce ? { duration: 0 } : {...}}`), landing on the exact same target either way. Gate any state (like a hover index) that feeds an animate value behind `if (reduce) return;` in the handler instead.
- Hero edges: two <img> per side, src swap, no will-change, no filter on containers (ten mounted layers blacked out the compositor in testing).
- Blur on parent, clip-path on child. Never both on one element when soft edges are wanted.
- No `backdrop-filter` except through the `.glass-live` utility, and only where real imagery moves behind the panel (nav once scrolled, the mobile menu, a card over the map or hero). Everywhere else (cards, tiles, cells over the flat canvas) use `.glass` (no backdrop-filter) or `.glass-pill` (pills). See globals.css.
- `GlassSlabs` renders a pre-rasterised poster (`public/brand/slabs/`, built by `npm run slabs`) by default; only pass `poster={false}` for a live, filtered, animatable SVG, and keep it to one or two instances on screen.
- WebGL only via next/dynamic ssr:false, DPR capped at 1 (ambient glows: `LightRays`, `PrismaticBurst`) or 1.5 max, paused off-screen, unmounted under reduced motion.
- No `mix-blend-mode` on a full-viewport layer (forces a re-blend against everything below on every repaint, not just its own).
- All content lives in src/data/*.ts. Never hardcode event facts in components.
- Copy: sentence case, no em/en dashes, one label per CTA intent ("Join the waitlist").
- Tokens only from globals.css @theme. Radius: panels 24, cards 20, buttons pill. Icons: Phosphor regular, one family.
- Every animation honours useReducedMotion(). Loader is skipped under reduced motion.
- Fonts come from next/font/google (Google Sans Flex with the wdth axis only, 116 KB; adding opsz or slnt balloons it to 300-500 KB. Google Sans Code for mono). No <link> to Google Fonts.
- ReactBits components are added with the shadcn CLI into src/components/reactbits/ and restyled to tokens; do not rewrite their motion logic. A documented perf/correctness patch (with a comment explaining why) is fine; see VariableProximity.tsx and LightRays.tsx for the pattern.
- Before claiming done: run the section 12 checks in docs/SPEC.md.

## Commands
- `npm run dev` / `npm run build` / `npm run lint`
- `npm run slabs` regenerates `public/brand/slabs/*.webp` and `public/brand/spotlight/cone.webp` from `src/components/brand/slabs.ts` (run after changing that file)
- `npx shadcn@latest add @react-bits/<Name>-TS-TW` (registry is configured in components.json), then move the created file from `src/components/<Name>.tsx` into `src/components/reactbits/` if the CLI doesn't place it there itself
