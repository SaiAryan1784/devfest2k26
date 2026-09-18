export type TrackColor = "blue" | "red" | "yellow" | "green" | "spectrum";

export const EVENT = {
  name: "DevFest Noida 2026",
  shortName: "DevFest Noida",
  organiser: "GDG Noida",
  year: 2026,
  // IST. Doors open at 9:00.
  date: "2026-10-10T09:00:00+05:30",
  dateLabel: "10 October 2026",
  // The 2026 venue is not settled. Only the region is public for now, so the
  // name, address and map come back here once it is confirmed and every
  // surface that shows a venue follows this one object.
  venue: {
    status: "tbd",
    label: "Announced soon",
    region: "Delhi NCR",
  },
  links: {
    waitlist: "https://www.commudle.com/fill-form/5096",
    community: "https://gdgnoida.com",
    sponsor: "mailto:noida.gdg@gmail.com",
    email: "noida.gdg@gmail.com",
    // TODO: supply the real URL.
    codeOfConduct: "https://gdgnoida.com",
  },
  socials: {
    instagram: "https://instagram.com/gdg_noida",
    linkedin: "https://linkedin.com/company/noidagdg",
    youtube: "https://youtube.com/@gdg_noida",
    // TODO: confirm. gdgnoida.com lists twitter.com/gdg-noida (hyphen), which may not resolve.
    x: "https://twitter.com/gdg-noida",
  },
  counts: {
    registered2025: 4400,
    speakers2025: 70,
    tracks: 4,
  },
  cta: {
    primary: "Join the waitlist",
    secondary: "See the tracks",
    sponsor: "Become a sponsor",
  },
} as const;
