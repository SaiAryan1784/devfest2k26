import { Lockup } from "@/components/brand/Lockup";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5 text-center">
      <div>
        <div className="mx-auto mb-10 w-[min(280px,60vw)]">
          <Lockup />
        </div>
        <h1 className="display mb-4 text-4xl font-medium md:text-6xl">That page is not on the floor.</h1>
        <p className="mx-auto mb-8 max-w-[40ch] text-muted">Try the home page, or the waitlist if you came for tickets.</p>
        <Button href="/">Back to DevFest Noida</Button>
      </div>
    </main>
  );
}
