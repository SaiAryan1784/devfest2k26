export type Slot = { time: string; title: string; kind: "doors" | "keynote" | "tracks" | "break" | "workshop" | "closing" };

// Tentative. Times are IST.
export const DAY: Slot[] = [
  { time: "09:00", title: "Doors open", kind: "doors" },
  { time: "10:00", title: "Keynote", kind: "keynote" },
  { time: "11:00", title: "Tracks begin", kind: "tracks" },
  { time: "13:00", title: "Lunch", kind: "break" },
  { time: "14:00", title: "Workshops", kind: "workshop" },
  { time: "17:00", title: "Closing and after-party", kind: "closing" },
];
