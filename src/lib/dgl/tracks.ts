import { DGL_TRACKS, type Track } from "@/data/dgl";

export type { Track };

export const TRACK_IDS: readonly Track[] = DGL_TRACKS.map((t) => t.id);

export const isTrack = (x: unknown): x is Track => typeof x === "string" && (TRACK_IDS as readonly string[]).includes(x);

export const trackLabel = (t: Track): string => DGL_TRACKS.find((x) => x.id === t)?.label ?? t;

/** An admin whose track is null (all tracks) may use any track; a track admin only their own. */
export const canAccessTrack = (adminTrack: Track | null, track: Track): boolean => adminTrack === null || adminTrack === track;

export const defaultTrackFor = (adminTrack: Track | null): Track => adminTrack ?? "build";
