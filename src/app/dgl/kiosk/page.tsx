import type { Metadata } from "next";
import { KioskView } from "@/components/dgl/KioskView";
import { DGL } from "@/data/dgl";
import { EVENT } from "@/data/event";

// noindex comes from the /dgl layout.
export const metadata: Metadata = {
  title: `${DGL.copy.kiosk.pageTitle} | ${EVENT.name}`,
};

/**
 * The volunteer backup voting kiosk: someone without connectivity hands their
 * score to a volunteer, who enters it here. A Server Component that reads no
 * cookies and touches no database: it renders the KioskView leaf, whose first
 * render (here and on the client) is the neutral "Checking session" screen.
 * Whether the visitor is signed in is decided in the browser by one
 * GET /api/dgl/admin/state, so nothing private is in this page's HTML.
 */
export default function KioskPage() {
  return (
    <main id="main" className="min-h-[100dvh]">
      <KioskView />
    </main>
  );
}
