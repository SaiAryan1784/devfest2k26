import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { Tickets } from "@/components/sections/Tickets";
import { Tracks } from "@/components/sections/Tracks";
import { Floor } from "@/components/sections/Floor";
import { Stage } from "@/components/sections/Stage";
import { Partners } from "@/components/sections/Partners";
import { Gallery } from "@/components/sections/Gallery";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";
import { LazyMount } from "@/components/ui/LazyMount";
import { AnchorFix } from "@/components/ui/AnchorFix";

export default function Page() {
  return (
    <>
      <Nav />
      <AnchorFix />
      <main id="main">
        <Hero />
        {/* Directly under the hero, no LazyMount: it is already inside the
            observer's 800px root margin at scroll 0, so a reservation could
            only guess wrong. */}
        <Tickets />
        {/* Anchor targets stay in the static HTML; the heavy section bodies mount as they approach. */}
        <LazyMount id="tracks" minHeight="110vh">
          <Tracks />
        </LazyMount>
        <LazyMount id="floor" minHeight="140vh">
          <Floor />
        </LazyMount>
        <LazyMount id="speakers" minHeight="100vh">
          <Stage />
        </LazyMount>
        <LazyMount id="partners" minHeight="70vh">
          <Partners />
        </LazyMount>
        <LazyMount id="gallery" minHeight="90vh">
          <Gallery />
        </LazyMount>
        <LazyMount minHeight="90vh">
          <FinalCta />
        </LazyMount>
      </main>
      <Footer />
    </>
  );
}
