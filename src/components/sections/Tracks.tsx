import { Container } from "@/components/ui/Container";
import { TRACKS } from "@/data/tracks";
import { TrackStack } from "./TrackStack";

export function Tracks() {
  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container>
        <h2 className="display mb-12 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">
          Pick your track. <em className="display-em">Or wander.</em>
        </h2>
      </Container>

      <Container>
        <TrackStack tracks={TRACKS} />
      </Container>
    </section>
  );
}
