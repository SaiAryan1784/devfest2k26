import { Container } from "@/components/ui/Container";
import { SPEAKERS_2025 } from "@/data/speakers";
import { SpeakerReel } from "./SpeakerReel";

/**
 * Last year's stage: the people who spoke at DevFest Noida 2025, as a reel of
 * their stage photos (SpeakerReel). Replaced a typographic card grid under a
 * moving amber spotlight once real photography existed; the photos now carry
 * the light themselves.
 */
export function Stage() {
  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container>
        <div className="mb-10 md:mb-14">
          <p className="glass-pill mb-6 inline-flex items-center gap-2 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted">
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-yellow" />
            2026 lineup announced soon
          </p>
          <h2 className="display mb-4 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">Last year&apos;s stage.</h2>
          <p className="max-w-[52ch] text-[clamp(1rem,1.8vw,1.25rem)] leading-relaxed text-muted">
            Before we reveal who&apos;s next, meet the voices who took the stage last year: engineers, architects, designers, and builders shaping what comes next.
          </p>
        </div>
        <SpeakerReel speakers={SPEAKERS_2025} />
      </Container>
    </section>
  );
}
