import type { PipeShape } from "@/components/brand/pipes";

export type FloorItem = {
  id: string;
  /** Short category label shown above the title. */
  kind: string;
  title: string;
  /** One short line, the item in a sentence. Shown between the title and the description. */
  tagline: string;
  description: string;
  /** The item's light-pipe mark, one of the shapes in src/components/brand/pipes.ts. Distinct from the four track marks. */
  glyph: PipeShape;
  isNew?: boolean;
};

/** Sits above the grid. */
export const FLOOR_INTRO =
  "The sessions are only half the story. Step onto the floor for live builds, robot battles, creator conversations, community demos, and plenty more to explore.";

// Everything on the floor beyond the four tracks. Order is display order.
export const FLOOR: FloorItem[] = [
  {
    id: "vibe-it-space",
    kind: "Space",
    title: "Vibe-it Space",
    tagline: "Learn it in the session. Build it your way.",
    description: "Walk out of the Hands-on Track and straight into a space to turn what you just learned into something real.",
    glyph: "arch",
    isNew: true,
  },
  {
    id: "robo-track-battle",
    kind: "Track",
    title: "Robo Track Battle",
    tagline: "Built by the community. Tested on the track.",
    description: "Watch community-built bots race, battle and navigate a live track between sessions.",
    glyph: "ring",
    isNew: true,
  },
  {
    id: "sketch-booth",
    kind: "Booth",
    title: "Vibe Code / Sketch Booth",
    tagline: "One prompt. One app. Zero waiting.",
    description: "Build at the booth, put your creation on the digital wall, and remix what others make.",
    glyph: "square",
  },
  {
    id: "bytes-with-influencers",
    kind: "Creators",
    title: "Bytes with Influencers",
    tagline: "Tech conversations, minus the conference formalities.",
    description: "Catch short, snackable conversations with tech creators happening live on the floor.",
    glyph: "chevron",
  },
  {
    id: "creator-studio",
    kind: "Podcast",
    title: "Creator Studio",
    tagline: "The conversation doesn't end on stage.",
    description: "Step into live podcast sessions with speakers and creators, recorded from the floor and shared beyond DevFest.",
    glyph: "wave",
  },
  {
    id: "community-demos",
    kind: "Community",
    title: "Community Demos",
    tagline: "Don't just hear what the community is building. See it.",
    description: "Explore projects from GDG Noida and GDGoC builders, on display throughout the day.",
    glyph: "corner",
  },
  {
    id: "small-business-fair",
    kind: "Signature",
    title: "Small Business Fair",
    tagline: "Meet the people building businesses their own way.",
    description: "Discover local, queer- and women-led businesses bringing their work, stories and products to the DevFest floor.",
    glyph: "hexagon",
  },
  {
    id: "speaker-meet",
    kind: "Access",
    title: "Speaker Meet & Greet",
    tagline: "From the stage to your conversation.",
    description: "Get unhurried time to connect, ask questions and talk with DevFest speakers beyond their sessions.",
    glyph: "fork",
  },
  {
    id: "photo-ops",
    kind: "Vibes",
    title: "Activities & Photo Ops",
    tagline: "Build something. Play something. Take the photo. Repeat.",
    description: "Jump into booths, games and photo-worthy spaces designed to make the floor as memorable as the sessions.",
    glyph: "diamond",
  },
];
