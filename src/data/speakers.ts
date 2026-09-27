/**
 * Last year's speakers, as photographed on the DevFest Noida 2025 stage
 * (supplied 27 Sep 2026, public/speakers2025/). Photos only, no names: the
 * client doesn't have names for all of them, so none are shown.
 *
 * Candid stage shots, not headshots, so every photo carries `focus`: where
 * the face sits, as a CSS object-position. The reel crops each photo three
 * very different ways (a narrow vertical slice, a wide open panel, a short
 * band on phones) and the face has to survive all of them.
 */
export type SpeakerPhoto = { src: string; focus: string };

export type Speaker = {
  id: string;
  photo: SpeakerPhoto;
  /** A second angle from the same talk, faded in while this speaker is open. */
  alt?: SpeakerPhoto;
};

export const SPEAKERS_2025: Speaker[] = [
  { id: "dp1a2896", photo: { src: "/speakers2025/dp1a2896.webp", focus: "43% 22%" } },
  {
    id: "dsc_9680",
    photo: { src: "/speakers2025/dsc_9680.webp", focus: "51% 33%" },
    alt: { src: "/speakers2025/dp1a2997.webp", focus: "45% 22%" },
  },
  { id: "dsc07393", photo: { src: "/speakers2025/dsc07393.webp", focus: "48% 28%" } },
  { id: "dsc07623", photo: { src: "/speakers2025/dsc07623.webp", focus: "50% 37%" } },
  { id: "dsc_9608", photo: { src: "/speakers2025/dsc_9608.webp", focus: "45% 27%" } },
  {
    id: "dsc07658",
    photo: { src: "/speakers2025/dsc07658.webp", focus: "40% 29%" },
    alt: { src: "/speakers2025/dsc07673.webp", focus: "53% 37%" },
  },
];
