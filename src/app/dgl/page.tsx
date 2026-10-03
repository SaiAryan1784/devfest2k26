import { AudienceView } from "@/components/dgl/AudienceView";
import { StaticLockup } from "@/components/dgl/StaticLockup";
import { DGL } from "@/data/dgl";

/**
 * The audience voting page, opened from the QR code in the hall. The shell
 * (mark and heading) is server HTML; everything live is the AudienceView leaf.
 * One column sized for a phone held in one hand, the grid in view without
 * scrolling at 390 x 844.
 */
export default function DglPage() {
  return (
    <main id="main" className="relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col px-4 pb-6 pt-4">
      <StaticLockup className="w-[92px]" />
      <h1 className="display mt-4 text-[20px] font-semibold leading-tight text-text">{DGL.name}</h1>
      <AudienceView />
    </main>
  );
}
