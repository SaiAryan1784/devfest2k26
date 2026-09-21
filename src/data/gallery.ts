/**
 * The gallery: eight photos from DevFest Noida 2025, supplied by the client
 * (public/devfest2k25/). Captions describe what's actually in each frame
 * (stage, crew, community) rather than naming a specific floor experience
 * none of these happen to show.
 */
export type GalleryPhoto = {
  id: string;
  caption: string;
  src: string;
  /** The one wide tile (2 columns on desktop); the rest are single cells. */
  feature?: boolean;
  /**
   * Vertical anchor for object-cover's crop, as a CSS percentage (0% is the
   * top of the source image); defaults to "50%" (center). The community shot
   * is a landscape group photo cropped into a very wide, short feature tile,
   * and the keynote shot is a tall portrait cropped into a short regular
   * tile: centering either lands on badges and legs, not faces, but a flat
   * "top" (0%) overshoots the other way and clips the faces themselves.
   */
  focusY?: string;
};

export const GALLERY: GalleryPhoto[] = [
  { id: "community", caption: "The community", src: "/devfest2k25/DP1A3071.webp", feature: true, focusY: "30%" },
  { id: "on-stage", caption: "On stage", src: "/devfest2k25/DSC09279.webp" },
  { id: "keynote", caption: "Keynote", src: "/devfest2k25/DSC07446.webp", focusY: "28%" },
  { id: "crew", caption: "The crew", src: "/devfest2k25/IMG_9537.webp" },
  { id: "team", caption: "Team DevFest", src: "/devfest2k25/DSC09738.webp" },
  { id: "backstage", caption: "Backstage", src: "/devfest2k25/DSC_9697.webp" },
  { id: "volunteers", caption: "Volunteers", src: "/devfest2k25/DSC09647.webp" },
  { id: "talks", caption: "Talks", src: "/devfest2k25/DSC07422.webp" },
];
