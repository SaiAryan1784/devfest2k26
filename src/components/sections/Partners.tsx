import { LogoLoop } from "@/components/reactbits/LogoLoop";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";
import { PAST_PARTNERS } from "@/data/sponsors";

// LogoLoop takes a literal CSS colour string for its fade edges, not a var()
// reference, so the token is resolved here once rather than duplicated.
const PAPER = "#f4f4f2"; // --color-paper

/**
 * Past partners, on a loop: sixteen real logos is exactly the "many things
 * that don't need individual attention" case CLAUDE.md's one-marquee rule is
 * for (the four-logo Simple Icons stand-in this replaced wasn't). The loop
 * sits on the page's one deliberate light surface (`bg-paper`, see
 * globals.css) because these are unrecolourable third-party rasters built
 * for a light background; a soft glow rather than a border keeps the one
 * bright rectangle on an otherwise black page from reading as a mistake.
 */
export function Partners() {
  const logos = PAST_PARTNERS.map((p) => ({ src: p.src, alt: p.name, href: p.url, title: p.name }));

  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container>
        <h2 className="display mb-10 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">Past partners</h2>

        <div className="relative isolate">
          <span aria-hidden="true" className="pointer-events-none absolute -inset-x-6 -inset-y-10 -z-10 rounded-[inherit] bg-paper/25 blur-3xl" />
          <div className="overflow-hidden rounded-panel bg-paper py-8">
            <LogoLoop
              logos={logos}
              logoHeight={40}
              gap={56}
              speed={38}
              direction="left"
              fadeOut
              fadeOutColor={PAPER}
              pauseOnHover
              scaleOnHover
              ariaLabel="Past partners"
            />
          </div>
        </div>

        <div className="glass mt-8 rounded-panel p-7 md:p-9 lg:mx-auto lg:max-w-[420px]">
          <p className="display text-2xl font-semibold leading-tight">Sponsor DevFest Noida 2026</p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Write to{" "}
            <a href={EVENT.links.sponsor} className="text-text underline underline-offset-4">
              {EVENT.links.email}
            </a>{" "}
            for the 2026 deck.
          </p>
          <Button href={EVENT.links.sponsor} variant="ghost" className="mt-6 w-full">
            {EVENT.cta.sponsor}
          </Button>
        </div>
      </Container>
    </section>
  );
}
