import Link from "next/link";
import { DGL, DGL_TRACKS } from "@/data/dgl";
import { StaticLockup } from "./StaticLockup";

/** The room list: /dgl (the audience picks the track they are watching) and /dgl/stage (a projector picks its track). */
export function TrackPicker({ title, body, hrefFor }: { title: string; body: string; hrefFor(track: string): string }) {
  return (
    <main id="main" className="relative mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col px-4 pb-8 pt-4">
      <StaticLockup className="w-[92px]" />
      <p className="mt-4 text-[13px] font-medium text-muted">{DGL.name}</p>
      <h1 className="display mt-1 text-[26px] font-semibold leading-tight text-text">{title}</h1>
      <p className="mt-2 text-[17px] text-muted">{body}</p>
      <ul className="mt-6 flex flex-col gap-3">
        {DGL_TRACKS.map((t) => (
          <li key={t.id}>
            <Link
              href={hrefFor(t.id)}
              className="glass flex min-h-16 items-center justify-between rounded-[20px] px-5 text-[22px] font-semibold text-text"
            >
              {t.label}
              <span aria-hidden="true" className="text-yellow-hi">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
