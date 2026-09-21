import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";
import { SocialLinks } from "./SocialLinks";

const LINKS = [
  { href: "#tracks", label: "Tracks" },
  { href: "#floor", label: "The floor" },
  { href: "#speakers", label: "Speakers" },
  { href: "#schedule", label: "Schedule" },
  { href: "#venue", label: "Venue" },
  { href: "#partners", label: "Partners" },
  { href: "#gallery", label: "Gallery" },
];

export function Footer() {
  return (
    <footer className="border-t border-hair py-16">
      <Container className="grid gap-12 md:grid-cols-[1fr_auto_auto] md:gap-16">
        <div>
          <p className="display text-2xl font-semibold">{EVENT.name}</p>
          <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-muted">
            {EVENT.dateLabel}. {EVENT.venue.shortLabel}.
          </p>
          <p className="mt-6 text-[15px] text-muted">
            Organised by{" "}
            <a href={EVENT.links.community} target="_blank" rel="noopener" className="text-text underline-offset-4 hover:underline">
              {EVENT.organiser}<span className="sr-only"> (opens in new tab)</span>
            </a>
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-10 gap-y-3 text-[15px] text-muted">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="inline-block py-1 transition-colors hover:text-text">
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <a href={EVENT.links.codeOfConduct} className="inline-block py-1 transition-colors hover:text-text">
                Code of conduct
              </a>
            </li>
            <li>
              <a href={`mailto:${EVENT.links.email}`} className="inline-block py-1 transition-colors hover:text-text">
                {EVENT.links.email}
              </a>
            </li>
          </ul>
        </nav>

        <SocialLinks />
      </Container>
    </footer>
  );
}
