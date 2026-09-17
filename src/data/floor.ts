export type FloorItem = {
  id: string;
  /** Short category label shown above the title. */
  kind: string;
  title: string;
  description: string;
  /** Cell on the Figma glyph sheet used as this item's mark. */
  glyph: string;
  isNew?: boolean;
};

// Everything on the floor beyond the four tracks. Order is display order.
export const FLOOR: FloorItem[] = [
  {
    id: "vibe-it-space",
    kind: "New for 2026",
    title: "Vibe-it Space",
    description: "Walk out of the Hands-on Track and straight into a space to vibe-build what you just learned.",
    glyph: "arch",
    isNew: true,
  },
  {
    id: "robo-track-battle",
    kind: "New for 2026",
    title: "Robo Track Battle",
    description: "Community-built bots race and battle on a live track between sessions.",
    glyph: "ring",
    isNew: true,
  },
  {
    id: "sketch-booth",
    kind: "Booth",
    title: "Vibe Code / Sketch Booth",
    description: "One prompt, one app. Built at the booth and cast onto a digital wall for everyone to remix.",
    glyph: "square",
  },
  {
    id: "bytes-with-influencers",
    kind: "Creators",
    title: "Bytes with Influencers",
    description: "Short, snackable conversations with tech creators, live on the floor.",
    glyph: "chevron",
  },
  {
    id: "creator-studio",
    kind: "Podcast",
    title: "Creator Studio",
    description: "Podcasts with speakers, recorded live and published through the season.",
    glyph: "wave",
  },
  {
    id: "community-demos",
    kind: "Community",
    title: "Community Demos",
    description: "Projects from GDG Noida and GDGoC builders, on open display all day.",
    glyph: "plus",
  },
  {
    id: "small-business-fair",
    kind: "Signature",
    title: "Small Business Fair",
    description: "Local, queer- and women-led businesses. Our values on the floor.",
    glyph: "hexagon",
  },
  {
    id: "speaker-meet",
    kind: "Access",
    title: "Speaker Meet & Greet",
    description: "Unhurried time with every speaker, built into the agenda, not squeezed in.",
    glyph: "fork",
  },
  {
    id: "photo-ops",
    kind: "Vibes",
    title: "Activities & Photo Ops",
    description: "Booths, games and a floor designed for photos. Lots of them.",
    glyph: "diamond",
  },
];
