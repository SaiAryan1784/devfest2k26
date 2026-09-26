import { EVENT } from "@/data/event";
import { TICKET_SALE } from "@/data/tickets";

/** Served by src/app/early-bird.ics/route.ts. */
export const ICS_PATH = "/early-bird.ics";

const TICKETS_URL = `${EVENT.url}/#tickets`;

function window() {
  const start = new Date(TICKET_SALE.opensAt);
  const end = new Date(start.getTime() + TICKET_SALE.reminder.minutes * 60_000);
  return { start, end };
}

/** 20260927T153000Z: the UTC form both Google Calendar and iCalendar take. */
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** A prefilled "add event" link for Google Calendar (uses the reader's own default alerts). */
export function googleCalendarUrl() {
  const { start, end } = window();
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: TICKET_SALE.reminder.title,
    dates: `${utc(start)}/${utc(end)}`,
    details: `${TICKET_SALE.reminder.details}\n\n${TICKETS_URL}`,
    location: TICKETS_URL,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** iCalendar TEXT escaping (RFC 5545 3.3.11). */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Fold content lines at 75 octets (RFC 5545 3.1). */
const bytes = (s: string) => new TextEncoder().encode(s).length;
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (bytes(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** A one-event calendar for Apple Calendar, Outlook and anything else that reads .ics, with alerts 10 minutes before and at opening. */
export function icsText() {
  const { start, end } = window();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GDG Noida//DevFest Noida 2026//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:early-bird-${utc(start)}@devfest2k26.gdgnoida.com`,
    `DTSTAMP:${utc(start)}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${esc(TICKET_SALE.reminder.title)}`,
    `DESCRIPTION:${esc(`${TICKET_SALE.reminder.details}\n\n${TICKETS_URL}`)}`,
    `URL:${TICKETS_URL}`,
    `LOCATION:${esc(TICKETS_URL)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc("Early bird passes open in 10 minutes")}`,
    "TRIGGER:-PT10M",
    "END:VALARM",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc("Early bird passes are open")}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
