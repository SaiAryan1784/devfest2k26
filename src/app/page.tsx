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

export default function Page() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        {/* Anchor targets stay in the static HTML; the heavy section bodies mount as they approach. */}
        <LazyMount id="tracks" minHeight="120vh">
          <Tracks />
        </LazyMount>
        <LazyMount id="floor" minHeight="100vh">
          <Floor />
        </LazyMount>
        <LazyMount id="speakers" minHeight="90vh">
          <Stage />
        </LazyMount>
        <LazyMount id="schedule" minHeight="50vh">
          <Schedule />
        </LazyMount>
        <LazyMount id="venue" minHeight="100vh">
          <Essentials />
        </LazyMount>
        <LazyMount id="partners" minHeight="50vh">
          <Partners />
        </LazyMount>
        <LazyMount minHeight="70vh">
          <FinalCta />
        </LazyMount>
      </main>
      <Footer />
    </>
  );
}
