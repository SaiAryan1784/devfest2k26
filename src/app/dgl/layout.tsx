import type { Metadata } from "next";
import { DglMotion } from "@/components/dgl/DglMotion";
import { DGL } from "@/data/dgl";
import { EVENT } from "@/data/event";

const TITLE = `${DGL.name} | ${EVENT.name}`;

// openGraph is merged shallowly, so without this a shared /dgl link unfurls with the main site's text.
// Defining it here also drops the root's file-based og:image, so the same image is named again.
export const metadata: Metadata = {
  title: TITLE,
  description: DGL.copy.metaDescription,
  openGraph: {
    title: TITLE,
    description: DGL.copy.metaDescription,
    type: "website",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }],
  },
  robots: { index: false },
};

export default function DglLayout({ children }: LayoutProps<"/dgl">) {
  return <DglMotion>{children}</DglMotion>;
}
