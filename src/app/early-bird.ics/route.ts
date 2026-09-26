import { icsText } from "@/lib/early-bird-reminder";

export const dynamic = "force-static";

/** The early bird "remind me" invite for Apple Calendar, Outlook and other .ics readers. */
export function GET() {
  return new Response(icsText(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // inline: iOS and macOS Safari offer "Add to Calendar" straight away; other browsers save it.
      "Content-Disposition": 'inline; filename="devfest-noida-early-bird.ics"',
    },
  });
}
