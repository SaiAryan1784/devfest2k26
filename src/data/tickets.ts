import { EVENT } from "./event";

/**
 * Ticket tiers and the early bird sale.
 *
 * No prices on the site (client, 26 Sep 2026): the cards sell on perks.
 *
 * TODO: both `cta.href` values point at the event waitlist (the same form
 * every other CTA on the page uses) until real per-tier checkout links
 * exist; swap them, and likely EVENT.cta.primary, when the sale opens.
 */
export type Ticket = {
  id: string;
  /** Chip above the name. A data label, not a section eyebrow. */
  kind: string;
  name: string;
  summary: string;
  /**
   * A lead-in shown as the first perk, above `includes`, when this pass
   * contains everything in another one (so the list doesn't repeat it).
   */
  builtOn?: string;
  includes: string[];
  cta: { label: string; href: string };
  /** The tier the page pushes. Exactly one ticket sets this. */
  featured: boolean;
};

/** The early bird sale: counted down to until it opens, then shown as live. */
export const TICKET_SALE = {
  label: "Early bird",
  /** 27 September 2026, 9 PM IST. */
  opensAt: "2026-09-27T21:00:00+05:30",
  opensLabel: "27 September 2026, 9 PM IST",
};

/** Sits beside the section heading, above the sale strip. */
export const TICKETS_INTRO =
  "Get the regular DevFest experience with the general pass, or unlock exclusive perks with the gold pass.";

export const TICKETS: Ticket[] = [
  {
    id: "vip-gold",
    kind: "Gold",
    name: "VIP gold pass",
    summary: "More perks. Less waiting. Better experience.",
    builtOn: "Everything in the general pass, plus",
    includes: [
      "Full access to DevFest",
      "Reserved check-in",
      "Priority queue for lunch",
      "Exclusive and premium swag",
      "Priority queue for swag",
    ],
    cta: { label: "Get the gold pass", href: EVENT.links.waitlist },
    featured: true,
  },
  {
    id: "general",
    kind: "Standard",
    name: "General pass",
    summary: "Every track, every hack space, one day on the floor.",
    includes: [
      "Access to DevFest sessions",
      "Learn and explore new technologies",
      "Network with developers and tech enthusiasts",
      "Be part of the DevFest community",
      "Experience the event and activities",
    ],
    cta: { label: "Get the general pass", href: EVENT.links.waitlist },
    featured: false,
  },
];
