@AGENTS.md

# DevFest Noida 2026 site

Design-led event landing page for GDG Noida. Next.js 16 App Router + Tailwind v4 + Motion + ReactBits. Dark only.
Full spec: docs/SPEC.md (copy of the approved plan). Reference glimpse: docs/reference/glimpse-v2.html. Figma originals: docs/reference/figma/. Brand assets: public/brand/.

## Rules
- Server Components by default; `'use client'` only on motion/pointer/scroll leaves.
- Motion (`motion/react`) for UI; GSAP only inside ReactBits SplitText; never both on one element.
- Continuous values (pointer, scroll) use MotionValues, never useState. No window scroll listeners.
- Hero edges: two <img> per side, src swap, no will-change, no filter on containers (ten mounted layers blacked out the compositor in testing).
- Blur on parent, clip-path on child. Never both on one element when soft edges are wanted.
- WebGL only via next/dynamic ssr:false, DPR <= 1.5, paused off-screen, unmounted under reduced motion.
- All content lives in src/data/*.ts. Never hardcode event facts in components.
- Copy: sentence case, no em/en dashes, one label per CTA intent ("Join the waitlist").
- Tokens only from globals.css @theme. Radius: panels 24, cards 20, buttons pill. Icons: Phosphor regular, one family.
- Every animation honours useReducedMotion(). Loader is skipped under reduced motion.
- Fonts come from next/font/google (Google Sans Flex with the wdth axis only, 116 KB; adding opsz or slnt balloons it to 300-500 KB. Google Sans Code for mono). No <link> to Google Fonts.
- ReactBits components are added with the shadcn CLI into src/components/reactbits/ and restyled to tokens; do not rewrite their motion logic.
- Before claiming done: run the section 12 checks in docs/SPEC.md.

## Commands
- `npm run dev` / `npm run build` / `npm run lint`
- `npx shadcn@latest add @react-bits/<Name>-TS-TW` (registry is configured in components.json)
