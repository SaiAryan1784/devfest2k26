import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BannerPreload } from "@/components/dgl/StageBanner";
import { StageView } from "@/components/dgl/StageView";
import { StaticLockup } from "@/components/dgl/StaticLockup";
import { DGL, DGL_TRACKS } from "@/data/dgl";
import { EVENT } from "@/data/event";
import { isTrack } from "@/lib/dgl/tracks";

// noindex comes from the /dgl layout.
export const metadata: Metadata = {
  title: `${DGL.copy.stageTitle} | ${EVENT.name}`,
};

export const dynamicParams = false;
export function generateStaticParams() {
  return DGL_TRACKS.map((t) => ({ track: t.id }));
}

/**
 * The projector screen for one track. A Server Component: the QR code for
 * that track's voting page is drawn here, at build time, so the `qrcode`
 * package never reaches the browser; the SVG string goes to the client
 * StageView, which polls the track's show. Dark modules on a near-white plate
 * (see DGL.stage.qr) with the standard four-module quiet zone.
 */
export default async function StagePage({ params }: { params: Promise<{ track: string }> }) {
  const { track } = await params;
  if (!isTrack(track)) notFound();
  const voteUrl = `${EVENT.url}/dgl/${track}`;
  const qrSvg = await QRCode.toString(voteUrl, {
    type: "svg",
    margin: 4,
    errorCorrectionLevel: "M",
    color: DGL.stage.qr,
  });

  return (
    <main id="main" className="min-h-[100dvh]">
      <BannerPreload />
      <StageView track={track} qrSvg={qrSvg} voteUrl={voteUrl.replace(/^https?:\/\//, "")} lockup={<StaticLockup className="w-[112px] lg:w-[148px]" />} />
    </main>
  );
}
