"use client";

import { useLayoutEffect, useState } from "react";
import { spinLeftMs } from "./wheel";

/**
 * Whether the current act's wheel is still spinning, in server time
 * (`Date.now() + offset`, offset from the poll; see clock.ts), so a screen can
 * hide the prompt until the wheel lands.
 *
 * False on the server and on the first client render, so hydration matches.
 * After mount, and again whenever `spunAtMs` (a re-spin restarts it) or the
 * measured offset changes, it is worked out once from the clock, and one
 * timeout turns it off when the spin ends. The timeout is cleared on every
 * change and on unmount, so nothing updates after unmount.
 *
 * A layout effect, not a plain one: a poll that brings a new spin hides the
 * prompt before the browser paints, where a plain effect would let it show
 * for one frame. React 19 does not warn about layout effects on the server.
 */
export function useSpinning(spunAtMs: number | null, offset: number): boolean {
  const [spinning, setSpinning] = useState(false);
  useLayoutEffect(() => {
    const left = spinLeftMs(spunAtMs, Date.now() + offset);
    // Deliberate: the answer depends on the client clock, which the server render cannot know (hydration).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpinning(left > 0);
    if (left <= 0) return;
    const timer = setTimeout(() => setSpinning(false), Math.ceil(left));
    return () => clearTimeout(timer);
  }, [spunAtMs, offset]);
  return spinning;
}
