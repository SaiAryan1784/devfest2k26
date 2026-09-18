# DevFest Noida 2026

Design-led landing page for GDG Noida's DevFest, 10 October 2026, Delhi NCR (venue to be announced).

Next.js 16 (App Router) · Tailwind CSS v4 · Motion · ReactBits (via the shadcn registry) · dark only.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm run start
npm run lint
npm run slabs      # regenerate the glass-slab and spotlight posters
```

Append `?noloader=1` to skip the intro loader while testing, or `?loader=1` to force it on a warm cache (it otherwise runs once per session, and only when assets take longer than 300 ms).

## Where things live

| What | Where |
|---|---|
| Event facts, links, socials, counts | `src/data/event.ts` |
| Tracks (4) | `src/data/tracks.ts` |
| Floor experiences (9) | `src/data/floor.ts` |
| Speakers, schedule, partners | `src/data/speakers.ts`, `schedule.ts`, `sponsors.ts` |
| Brand assets (exports, glyphs, lockups) | `public/brand/` |
| Design tokens | `src/app/globals.css` (`@theme`) |
| Signature components (glass slabs, hero edges, spotlight, lockup) | `src/components/brand/` |
| Page sections | `src/components/sections/` |
| Vendored ReactBits components | `src/components/reactbits/` |
| Full spec, decisions, build log | `docs/SPEC.md` |
| Rules for AI-assisted edits | `CLAUDE.md` |

## Updating content

Everything visible is data. To rename a track, add a speaker, swap the ticket link, or change the date, edit the matching file in `src/data/` and nothing else. Speaker photos go in `public/brand/speakers/` and are referenced by path; `photo: null` renders initials until then.

## Adding a ReactBits component

```bash
npx shadcn@latest add @react-bits/<Name>-TS-TW
```

It lands in `src/components/reactbits/`. Restyle to tokens; do not rewrite its motion logic.

## Deploy

Vercel, default settings. The build is fully static (`○` routes), so any static host works too.
