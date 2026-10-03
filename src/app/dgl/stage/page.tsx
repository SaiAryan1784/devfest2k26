import type { Metadata } from "next";
import QRCode from "qrcode";
import { StageView } from "@/components/dgl/StageView";
import { StaticLockup } from "@/components/dgl/StaticLockup";
import { DGL } from "@/data/dgl";
import { EVENT } from "@/data/event";

// noindex comes from the /dgl layout.
export const metadata: Metadata = {
  title: `${DGL.copy.stageTitle} | ${EVENT.name}`,
};

/**
 * The projector screen. A Server Component: the QR code for the voting page
 * is drawn here, at build time, so the `qrcode` package never reaches the
 * browser; the SVG string goes to the client StageView, which polls the show.
 * Dark modules on a near-white plate (see DGL.stage.qr) with the standard
 * four-module quiet zone, so a phone at the back of a hall reads it off a
 * projector.
 */
export default async function StagePage() {
  const voteUrl = `${EVENT.url}/dgl`;
  const qrSvg = await QRCode.toString(voteUrl, {
    type: "svg",
    margin: 4,
    errorCorrectionLevel: "M",
    color: DGL.stage.qr,
  });

  return (
    <main id="main" className="min-h-[100dvh]">
      <StageView qrSvg={qrSvg} voteUrl={voteUrl.replace(/^https?:\/\//, "")} lockup={<StaticLockup className="w-[112px] lg:w-[148px]" />} />
    </main>
  );
}
