import type { Metadata } from "next";
import { AdminConsole } from "@/components/dgl/AdminConsole";
import { DGL } from "@/data/dgl";
import { EVENT } from "@/data/event";

// noindex comes from the /dgl layout.
export const metadata: Metadata = {
  title: `${DGL.copy.admin.pageTitle} | ${EVENT.name}`,
};

/**
 * The show console. A Server Component that reads no cookies and touches no
 * database: it renders the AdminConsole leaf, whose first render (here and
 * on the client) is the neutral "Checking session" screen. Whether the
 * visitor is signed in is decided in the browser by GET /api/dgl/admin/state
 * (200 or 401), so no admin data is ever in this page's HTML.
 */
export default function AdminPage() {
  return (
    <main id="main" className="min-h-[100dvh]">
      <AdminConsole />
    </main>
  );
}
