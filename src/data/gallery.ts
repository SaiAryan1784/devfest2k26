/**
 * The gallery: nine glimpses of the floor, one per experience already
 * described in floor.ts (no new copy invented). `src` is a seeded picsum
 * placeholder: TODO, swap every one of these for real 2025 event photography
 * before launch, the same honesty pattern speakers.ts's `photo: null` uses.
 */
export type GalleryPhoto = {
  id: string;
  caption: string;
  src: string;
  /** The first tile is the bento feature (2x2 on desktop, full width on tablet). */
  feature?: boolean;
};

export const GALLERY: GalleryPhoto[] = [
  { id: "vibe-it-space", caption: "Vibe-it Space", src: "https://picsum.photos/seed/devfest-noida-vibe-it-space/900/900", feature: true },
  { id: "robo-track-battle", caption: "Robo Track Battle", src: "https://picsum.photos/seed/devfest-noida-robo-track-battle/500/500" },
  { id: "sketch-booth", caption: "Vibe Code / Sketch Booth", src: "https://picsum.photos/seed/devfest-noida-sketch-booth/500/500" },
  { id: "bytes-with-influencers", caption: "Bytes with Influencers", src: "https://picsum.photos/seed/devfest-noida-bytes-with-influencers/500/500" },
  { id: "creator-studio", caption: "Creator Studio", src: "https://picsum.photos/seed/devfest-noida-creator-studio/500/500" },
  { id: "community-demos", caption: "Community Demos", src: "https://picsum.photos/seed/devfest-noida-community-demos/500/500" },
  { id: "small-business-fair", caption: "Small Business Fair", src: "https://picsum.photos/seed/devfest-noida-small-business-fair/500/500" },
  { id: "speaker-meet", caption: "Speaker Meet & Greet", src: "https://picsum.photos/seed/devfest-noida-speaker-meet/500/500" },
  { id: "photo-ops", caption: "Activities & Photo Ops", src: "https://picsum.photos/seed/devfest-noida-photo-ops/500/500" },
];
