import type { TrackColor } from "./event";

export type Track = {
  id: string;
  name: string;
  color: Exclude<TrackColor, "spectrum">;
  tagline: string;
  description: string;
  /** Format label shown on the panel. Never a made-up session count. */
  format: string;
  /** Cell on the Figma glyph sheet used as this track's mark. */
  glyph: string;
};

export const TRACKS: Track[] = [
  {
    id: "ai-overloaded",
    name: "AI Overloaded",
    color: "blue",
    tagline: "The complete agentic track",
    description: "Agents, harnesses, open models, evals, cloud and dev.",
    format: "Talks",
    glyph: "s-wave",
  },
  {
    id: "ai-abc",
    name: "AI ABC",
    color: "green",
    tagline: "AnyBody Can Code",
    description: "AI from first principles for devs, designers, PMs and entrepreneurs.",
    format: "Talks",
    glyph: "arc",
  },
  {
    id: "ai-hardware",
    name: "AI × Hardware",
    color: "red",
    tagline: "Two hack spaces",
    description:
      "A showcase of people building in hardware: RPis on surveillance duty, bots roaming the floor, drones overhead, world models you can step into. And a robot racetrack for the passionate makers.",
    format: "2 hack spaces",
    glyph: "x",
  },
  {
    id: "hands-on",
    name: "Hands-on",
    color: "yellow",
    tagline: "Guided hands-on learning",
    description: "Gemma on Edge, the Cloud track, open source and so much more.",
    format: "Hands-on",
    glyph: "cross",
  },
];
