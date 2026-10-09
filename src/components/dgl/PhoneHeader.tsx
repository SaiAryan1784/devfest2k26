import { DGL, DGL_TRACKS, type Track } from "@/data/dgl";
import type { Connection } from "@/lib/dgl/connection";
import { ConnectionPill } from "./ConnectionPill";

/**
 * The audience page's header: the show's name in the DGL gold (the one accent,
 * the site's yellow-hi), then this room's track chip and the connection pill
 * on a second line (all three do not fit one line at 360 px). No lockup and
 * no image: the mark lives on the stage and the poster, the phone only needs
 * to say where you are. Presentational and hook-free, so it renders on the
 * server and in AudienceView alike.
 */
export function PhoneHeader({ track, connection }: { track: Track; connection: Connection }) {
  const label = DGL_TRACKS.find((t) => t.id === track)?.label ?? track;
  return (
    <header className="flex flex-col gap-2 [@media(max-height:700px)]:gap-1">
      <h1 className="display text-[22px] font-semibold leading-tight text-yellow-hi [@media(max-height:700px)]:text-[20px]">{DGL.name}</h1>
      <div className="flex items-center justify-between gap-3">
        <span className="glass-pill inline-flex h-8 rounded-pill items-center px-3 text-[15px] font-medium text-text">{label}</span>
        <ConnectionPill connection={connection} />
      </div>
    </header>
  );
}
