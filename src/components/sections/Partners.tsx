import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";
import { PAST_PARTNERS } from "@/data/sponsors";

/**
 * Past partners, shown still rather than looping. Four logos is not enough to
 * justify a marquee: on a loop they just repeat, which is what made this
 * section read as filler. Logos only, no category labels, beside the one
 * thing this section is actually for.
 */
export function Partners() {
  return (
    <section className="py-20 md:py-24 lg:py-28">
      <Container className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
        <div>
          <h2 className="display mb-10 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">Past partners</h2>
          <ul className="flex w-full flex-wrap items-center gap-x-12 gap-y-8 sm:justify-between sm:pr-8">
            {PAST_PARTNERS.map((p) => (
              <li key={p.slug}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener"
                  className="block opacity-70 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://cdn.simpleicons.org/${p.slug}/f5f5f7`}
                    alt={p.name}
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="h-11 w-auto"
                  />
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass rounded-panel p-7 md:p-9 lg:max-w-[380px]">
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
