import { InstagramLogo, LinkedinLogo, XLogo, YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { EVENT } from "@/data/event";

const SOCIALS = [
  { href: EVENT.socials.instagram, label: "Instagram", Icon: InstagramLogo },
  { href: EVENT.socials.linkedin, label: "LinkedIn", Icon: LinkedinLogo },
  { href: EVENT.socials.youtube, label: "YouTube", Icon: YoutubeLogo },
  { href: EVENT.socials.x, label: "X", Icon: XLogo },
];

const LINKS = [
  { href: "#tracks", label: "Tracks" },
  { href: "#floor", label: "The floor" },
  { href: "#speakers", label: "Speakers" },
  { href: "#schedule", label: "Schedule" },
  { href: "#venue", label: "Venue" },
  { href: "#partners", label: "Partners" },
];

export function Footer() {
  return (
    <footer className="border-t border-hair py-16">
      <Container className="grid gap-12 md:grid-cols-[1fr_auto_auto] md:gap-16">
        <div>
          <p className="display text-2xl font-semibold">{EVENT.name}</p>
          <p className="mt-2 max-w-[40ch] text-[15px] leading-relaxed text-muted">
            {EVENT.dateLabel}. {EVENT.venue.region}. Venue {EVENT.venue.label.toLowerCase()}.
          </p>
          <p className="mt-6 text-[15px] text-muted">
            Organised by{" "}
            <a href={EVENT.links.community} target="_blank" rel="noopener" className="text-text underline-offset-4 hover:underline">
              GDG Noida<span className="sr-only"> (opens in new tab)</span>
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

        <ul className="flex gap-2" aria-label="Social links">
          {SOCIALS.map(({ href, label, Icon }) => (
            <li key={label}>
              <a
                href={href}
                target="_blank"
                rel="noopener"
                aria-label={`${label} (opens in new tab)`}
                className="glass-pill grid size-11 place-items-center rounded-pill text-text transition-colors hover:bg-white/10"
              >
                <Icon size={20} />
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </footer>
  );
}
