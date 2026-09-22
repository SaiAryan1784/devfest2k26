import { EVENT } from "./event";

/**
 * Ticket tiers and the early bird sale.
 *
 * TODO (placeholder, 23 Sep 2026): pricing, inclusions and both `cta.href`
 * values are dummy content. Both CTAs point at the event waitlist (the same
 * form every other CTA on the page uses) until real per-tier checkout links
 * exist; swap those two fields, and likely EVENT.cta.primary, on the day
 * tickets actually go on sale.
 *
 * Prices are written out as display strings rather than formatted with
 * Intl.NumberFormat: this section renders on the server, and a hardcoded
 * string can never disagree between the server's locale data and the
 * reader's.
 */
export type Ticket = {
  id: string;
  /** Chip above the name. A data label, not a section eyebrow. */
  kind: string;
  name: string;
  summary: string;
  price: string;
  /** List price, struck through while the early bird sale runs. Null when there is none. */
  wasPrice: string | null;
  priceNote: string;
  includes: string[];
  cta: { label: string; href: string };
  /** The tier the page pushes. Exactly one ticket sets this. */
  featured: boolean;
  /** Availability line under the button. */
  note?: string;
};

export const TICKET_SALE = {
  label: "Early bird",
  /** 27 September 2026, 23:59 IST. */
  endsAt: "2026-09-27T23:59:00+05:30",
  endsLabel: "27 September 2026, 23:59 IST",
  line: "Early bird pricing runs until the timer stops. Both passes go up after that.",
};

export const TICKETS: Ticket[] = [
  {
    id: "vip-gold",
    kind: "Gold",
    name: "VIP gold pass",
    summary: "The whole day, up front, with the people running it.",
    price: "₹4,999",
    wasPrice: "₹6,499",
    priceNote: "Per person, taxes included",
    includes: [
      "Reserved seating in the keynote hall",
      "Speaker meet and greet before the afternoon sessions",
      "Both hack spaces and every hands-on lab",
      "Lunch, coffee and the 2026 swag kit",
      "Entry to the after party",
    ],
    cta: { label: "Get the gold pass", href: EVENT.links.waitlist },
    featured: true,
    note: "Limited to 100 passes.",
  },
  {
    id: "general",
    kind: "Standard",
    name: "General pass",
    summary: "Every track, every hack space, one day on the floor.",
    price: "₹999",
    wasPrice: "₹1,499",
    priceNote: "Per person, taxes included",
    includes: [
      "All four tracks and the full floor",
      "Both hack spaces and the robot track",
      "Lunch and coffee through the day",
      "Certificate of participation",
    ],
    cta: { label: "Get the general pass", href: EVENT.links.waitlist },
    featured: false,
    note: "Tickets are announced to the waitlist first.",
  },
];
