"use client";

import { LogoLoop } from "@/components/reactbits/LogoLoop";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";
import { PAST_PARTNERS } from "@/data/sponsors";

/** The page's one marquee: real partner marks from Simple Icons, logos only. */
export function Partners() {
  const logos = PAST_PARTNERS.map((p) => ({
    src: `https://cdn.simpleicons.org/${p.slug}/f5f5f7`,
    alt: p.name,
    title: p.name,
    height: 36,
    width: 36,
  }));

  return (
    <section className="py-24 md:py-32 lg:py-40">
      <Container>
        <h2 className="display mb-10 text-[clamp(2.2rem,5vw,4.5rem)] font-medium leading-none">Past partners</h2>
      </Container>
      <LogoLoop
        logos={logos}
        speed={60}
        logoHeight={36}
        gap={96}
        pauseOnHover
        fadeOut
        fadeOutColor="#050505"
        ariaLabel="Past DevFest Noida partners"
        className="opacity-80"
      />
      <Container className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4">
        <Button href={EVENT.links.sponsor} variant="ghost">
          {EVENT.cta.sponsor}
        </Button>
        <p className="text-[15px] text-muted">
          Write to{" "}
          <a href={EVENT.links.sponsor} className="text-text underline underline-offset-4">
            {EVENT.links.email}
          </a>{" "}
          for the 2026 deck.
        </p>
      </Container>
    </section>
  );
}
