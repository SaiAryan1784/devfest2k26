import type { Metadata, Viewport } from "next";
import { Google_Sans_Flex, Google_Sans_Code } from "next/font/google";
import { EVENT } from "@/data/event";
import { Loader } from "@/components/loader/Loader";
import "./globals.css";

// Both fonts are self-hosted by next/font at build time. The width axis alone
// gives the display type its emphasis without a second family (116 KB latin file).
const gsFlex = Google_Sans_Flex({
  variable: "--font-gs-flex",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  // Next has no metric overrides for this face yet; skip the synthetic fallback rather than warn on every build.
  adjustFontFallback: false,
});

const gsCode = Google_Sans_Code({
  variable: "--font-gs-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: EVENT.name,
  description: `One day, five tracks, and thousands of developers from across Delhi NCR. ${EVENT.dateLabel}, ${EVENT.venue.name}, ${EVENT.venue.city}.`,
  openGraph: {
    title: EVENT.name,
    description: `One day, five tracks, and thousands of developers from across Delhi NCR. ${EVENT.dateLabel}, ${EVENT.venue.name}, ${EVENT.venue.city}.`,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${gsFlex.variable} ${gsCode.variable}`}>
      <head>
        <link rel="preload" as="image" href="/brand/exports/spectrum.webp" />
      </head>
      <body className="min-h-dvh bg-canvas text-text">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-full focus:bg-text focus:px-4 focus:py-2 focus:text-canvas"
        >
          Skip to content
        </a>
        <Loader />
        {children}
        {/* Film grain, fixed and inert so it never repaints with scroll. */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[60] opacity-[.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          }}
        />
      </body>
    </html>
  );
}
