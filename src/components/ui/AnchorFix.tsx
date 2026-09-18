"use client";

import { useEffect } from "react";

const SETTLE_MS = 1600;

/**
 * Lazy-mounted sections change height after an anchor jump has already happened.
 * For a short window after any hash navigation, re-align the target whenever the
 * document grows, so "#speakers" lands on the speakers even as sections above mount.
 */
export function AnchorFix() {
  useEffect(() => {
    let until = 0;
    let target: HTMLElement | null = null;

    const align = () => {
      if (!target || Date.now() > until) return;
      target.scrollIntoView({ block: "start", behavior: "auto" });
    };
    const onHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      target = id ? document.getElementById(id) : null;
      until = Date.now() + SETTLE_MS;
      align();
    };

    const ro = new ResizeObserver(align);
    ro.observe(document.body);
    window.addEventListener("hashchange", onHash);
    if (location.hash) onHash();
    return () => {
      ro.disconnect();
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  return null;
}
