export type TrackColor = "blue" | "red" | "yellow" | "green" | "spectrum";

export const EVENT = {
  name: "DevFest Noida 2026",
  shortName: "DevFest Noida",
  organiser: "GDG Noida",
  year: 2026,
  /** The live site, for links that leave it (calendar invites). */
  url: "https://devfest2k26.gdgnoida.com",
  // IST. Doors open at 9:00.
  date: "2026-10-10T09:00:00+05:30",
  dateLabel: "10 October 2026",
  // Confirmed 21 Sep 2026. Every surface that shows a venue follows this one
  // object; shortLabel is for tight spaces (hero facts row, footer), label
  // and address for the full reveal (the footer), mapsEmbedUrl needs no
  // Google Maps API key (the keyless `?output=embed` form) and is kept even
  // though no surface currently embeds it.
  venue: {
    status: "confirmed",
    label: "ExpoInn Suites & Convention",
    shortLabel: "ExpoInn, Greater Noida",
    address: "India Exposition Mart, Gate 11, 25-29, Knowledge Park II, Greater Noida, Uttar Pradesh 201310",
    region: "Delhi NCR",
    mapsLink: "https://maps.google.com/?q=ExpoInn+Suites+%26+Convention+Knowledge+Park+II+Greater+Noida",
    mapsEmbedUrl: "https://www.google.com/maps?q=ExpoInn+Suites+%26+Convention%2C+Greater+Noida&output=embed",
  },
  links: {
    waitlist: "https://www.commudle.com/fill-form/5096",
    community: "https://gdgnoida.com",
    sponsor: "mailto:noida.gdg@gmail.com",
    email: "noida.gdg@gmail.com",
    // TODO: supply the real URL.
    codeOfConduct: "https://gdgnoida.com",
    // The floor's own sign-up, separate from the event waitlist.
    floorRegistration: "https://forms.gle/jEhBkWbDwdefZFBp7",
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
  // The billboard: one line under the headline, and the silent loop behind it
  // (a 46 s cut of the 2025 aftermovie, encoded by scripts/encode-hero-video.sh:
  // HEVC for browsers that decode it in hardware, H.264 for the rest).
  hero: {
    description: "Four tracks of talks and hands-on labs, two hack spaces, and a floor full of builders.",
    video: {
      desktop: "/video/hero-1080.mp4",
      desktopHevc: "/video/hero-1080.hevc.mp4",
      mobile: "/video/hero-720.mp4",
      mobileHevc: "/video/hero-720.hevc.mp4",
      poster: "/video/hero-poster.webp",
      posterMobile: "/video/hero-poster-720.webp",
    },
  },
} as const;
