import { DGL } from "@/data/dgl";
import type { Connection } from "@/lib/dgl/use-dgl-state";
import { cn } from "@/lib/utils";

const DOT: Record<Connection, string> = {
  live: "bg-green-hi",
  reconnecting: "bg-yellow-hi",
  offline: "bg-red-hi",
};

/**
 * How this screen is talking to the show: live, reconnecting or offline, in
 * words. The dot is the one status dot on a DGL screen and only repeats the
 * word; colour is never the only signal. Presentational, so the stage, admin
 * and kiosk can show the same pill. `role="status"` lets a screen reader hear
 * a drop or a recovery without the voter looking away from the stage.
 */
export function ConnectionPill({ connection, className }: { connection: Connection; className?: string }) {
  return (
    <span role="status" className={cn("glass-pill inline-flex h-8 shrink-0 items-center gap-2 rounded-pill px-3 text-[13px] font-medium text-text", className)}>
      <span aria-hidden="true" className={cn("size-2 rounded-pill", DOT[connection])} />
      {DGL.copy.connection[connection]}
    </span>
  );
}
