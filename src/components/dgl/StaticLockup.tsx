import { cn } from "@/lib/utils";
import { DGL } from "@/data/dgl";
import { BRACKET_L, BRACKET_R, CAPSULE, INK, LOCKUP_VIEWBOX, NOIDA, PILL, PILL_RECT, RECT_STROKE, WORDMARK, YEAR } from "@/components/brand/lockup-paths";

/**
 * The DevFest Noida 2026 lockup with no motion, for /dgl. The shared Lockup
 * animates its pill with `motion.rect`, which throws under the /dgl layout's
 * `LazyMotion strict`; this one draws the same geometry with a plain <rect>
 * and the spectrum pill colour. A server component: it ships no JS.
 */
export function StaticLockup({ className }: { className?: string }) {
  return (
    <svg viewBox={LOCKUP_VIEWBOX} fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={DGL.copy.lockupLabel} className={cn("block h-auto overflow-visible", className)}>
      <path d={BRACKET_R} fill="white" stroke={INK} strokeLinejoin="round" />
      <path d={BRACKET_L} fill="white" stroke={INK} strokeLinejoin="round" />
      {WORDMARK.map((d, i) => (
        <path key={i} d={d} fill="white" />
      ))}
      <rect {...CAPSULE} fill="white" stroke={INK} strokeWidth={RECT_STROKE} />
      <rect {...PILL_RECT} fill={PILL.spectrum} stroke={INK} strokeWidth={RECT_STROKE} />
      <path d={YEAR} fill="white" />
      <path d={NOIDA} fill={INK} />
    </svg>
  );
}
