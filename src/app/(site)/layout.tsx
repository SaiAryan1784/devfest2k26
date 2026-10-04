import { Loader } from "@/components/loader/Loader";
import { CursorFx } from "@/components/ui/CursorFx";
import { ExcitedButton } from "@/components/ui/ExcitedButton";
import { EarlyBirdToast } from "@/components/ui/EarlyBirdToast";

// The marketing site's heavy chrome lives here, not in the root layout, so the
// light /dgl pages (weak venue Wi-Fi) never ship or mount it. Nested layout:
// no <html>, URLs unchanged.
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Loader />
      {children}
      <CursorFx />
      <ExcitedButton />
      <EarlyBirdToast />
    </>
  );
}
