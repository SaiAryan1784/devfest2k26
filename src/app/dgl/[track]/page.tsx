import { notFound } from "next/navigation";
import { AudienceView } from "@/components/dgl/AudienceView";
import { DGL_TRACKS } from "@/data/dgl";
import { isTrack } from "@/lib/dgl/tracks";

// Only the three tracks exist; any other value is a 404. The static admin and kiosk pages win over this.
export const dynamicParams = false;
export function generateStaticParams() {
  return DGL_TRACKS.map((t) => ({ track: t.id }));
}

/**
 * The audience voting page for one track, opened from that stage's QR code.
 * The shell is this one column, sized for a phone held in one hand: the
 * header (name, track chip, connection pill) and everything live is the
 * AudienceView leaf, server-rendered in its neutral first state. No bottom
 * padding here: the voting screen pins "Lock in" to the bottom edge itself
 * (above the safe area) and the other screens pad themselves.
 */
export default async function TrackPage({ params }: { params: Promise<{ track: string }> }) {
  const { track } = await params;
  if (!isTrack(track)) notFound();
  return (
    <main id="main" className="relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col px-4 pt-4 [@media(max-height:700px)]:pt-3">
      <AudienceView track={track} />
    </main>
  );
}
