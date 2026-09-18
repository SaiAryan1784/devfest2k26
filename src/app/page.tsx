import { Nav } from "@/components/sections/Nav";
import { Hero } from "@/components/sections/Hero";
import { Tracks } from "@/components/sections/Tracks";
import { Floor } from "@/components/sections/Floor";
import { Stage } from "@/components/sections/Stage";
import { Schedule } from "@/components/sections/Schedule";
import { Essentials } from "@/components/sections/Essentials";
import { Partners } from "@/components/sections/Partners";
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
        {/* Anchor targets stay in the static HTML; the heavy section bodies mount as they approach. */}
        <LazyMount id="tracks" minHeight="340vh">
          <Tracks />
        </LazyMount>
        <LazyMount id="floor" minHeight="150vh">
          <Floor />
        </LazyMount>
        <LazyMount id="speakers" minHeight="110vh">
          <Stage />
        </LazyMount>
        <LazyMount id="schedule" minHeight="70vh">
          <Schedule />
        </LazyMount>
        <LazyMount id="venue" minHeight="130vh">
          <Essentials />
        </LazyMount>
        <LazyMount id="partners" minHeight="60vh">
          <Partners />
        </LazyMount>
        <LazyMount minHeight="90vh">
          <FinalCta />
        </LazyMount>
      </main>
      <Footer />
    </>
  );
}
