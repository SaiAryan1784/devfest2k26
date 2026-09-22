import { Container } from "@/components/ui/Container";
import { TRACKS, TRACKS_NOTE } from "@/data/tracks";
import { TrackBoard } from "./TrackBoard";

export function Tracks() {
  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container>
        <div className="mb-10 flex flex-col gap-5 md:mb-12 md:flex-row md:items-end md:justify-between">
          <h2 className="display text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">Pick your track.</h2>
          <p className="max-w-[38ch] text-[15px] leading-relaxed text-muted">{TRACKS_NOTE}</p>
        </div>
        <TrackBoard tracks={TRACKS} />
      </Container>
    </section>
  );
}
