import type { PipeShape } from "@/components/brand/pipes";
import type { TrackColor } from "./event";

export type Track = {
  id: string;
  name: string;
  color: Exclude<TrackColor, "spectrum">;
  /** Small mono line above the name. */
  kicker: string;
  /** The whole track in one line. */
  line: string;
  /** Format chip. Absent where the track is not one single format. Never a made-up session count. */
  format?: string;
  /** The track's light-pipe mark, one of the shapes in src/components/brand/pipes.ts. */
  glyph: PipeShape;
};

/** Sits beside the section heading. */
export const TRACKS_NOTE = "All four run all day, and one pass covers every one of them, so you can move as the day goes.";

export const TRACKS: Track[] = [
  {
    id: "ai-overloaded",
    name: "AI Overloaded",
    color: "blue",
    kicker: "The complete agentic",
    line: "From AI that answers to AI that actually does.",
    format: "Talks",
    glyph: "s-wave",
  },
  {
    id: "ai-abc",
    name: "AI ABC",
    color: "green",
    kicker: "AnyBody Can Code",
    line: "From \"What is AI?\" to \"What can I build?\"",
    format: "Talks",
    glyph: "arc",
  },
  {
    id: "ai-hardware",
    name: "AI × Hardware",
    color: "red",
    kicker: "Two hack spaces",
    line: "When AI leaves the screen, things get interesting.",
    glyph: "x",
  },
  {
    id: "hands-on",
    name: "Hands-on",
    color: "yellow",
    kicker: "Guided hands-on learning",
    line: "Less watching. More building.",
    glyph: "cross",
  },
];
