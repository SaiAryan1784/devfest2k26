import { notFound } from "next/navigation";
import { AudienceView } from "@/components/dgl/AudienceView";
import { StaticLockup } from "@/components/dgl/StaticLockup";
import { DGL, DGL_TRACKS } from "@/data/dgl";
import { isTrack } from "@/lib/dgl/tracks";

// Only the three tracks exist; any other value is a 404. The static admin and kiosk pages win over this.
export const dynamicParams = false;
export function generateStaticParams() {
  return DGL_TRACKS.map((t) => ({ track: t.id }));
}

/**
 * The audience voting page for one track, opened from that stage's QR code.
 * The shell (mark and heading) is server HTML; everything live is the
 * AudienceView leaf. One column sized for a phone held in one hand.
 */
export default async function TrackPage({ params }: { params: Promise<{ track: string }> }) {
  const { track } = await params;
  if (!isTrack(track)) notFound();
  const label = DGL_TRACKS.find((t) => t.id === track)!.label;
  return (
    <main id="main" className="relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col px-4 pb-6 pt-4">
      <div className="flex items-center justify-between gap-3">
        <StaticLockup className="w-[92px]" />
        <span className="glass-pill px-3 py-1 text-[15px] font-medium text-text">{label}</span>
      </div>
      <h1 className="display mt-4 text-[20px] font-semibold leading-tight text-text">{DGL.name}</h1>
      <AudienceView track={track} />
    </main>
  );
}
