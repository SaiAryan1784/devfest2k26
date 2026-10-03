"use client";

import { useEffect } from "react";
import { DGL } from "@/data/dgl";

const HIDDEN = "cursor-none";

/**
 * Hides the mouse pointer on the projector after DGL.stage.cursorIdleMs
 * without movement, and brings it back on the next move. A class on the
 * target element, toggled from a pointermove listener and one timeout: no
 * React state, nothing re-renders. Renders nothing.
 */
export function IdleCursor({ target }: { target: React.RefObject<HTMLElement | null> }) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      el.classList.remove(HIDDEN);
      timer = setTimeout(() => el.classList.add(HIDDEN), DGL.stage.cursorIdleMs);
    };
    arm();
    el.addEventListener("pointermove", arm, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("pointermove", arm);
      el.classList.remove(HIDDEN);
    };
  }, [target]);
  return null;
}
