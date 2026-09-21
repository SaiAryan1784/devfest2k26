"use client";

import { Heart } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import PulseHeart from "@/components/reactbits/PulseHeart";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";

const STORAGE_KEY = "devfest-excited";

/**
 * A floating "I'm excited" toggle, shared across every visitor via
 * /api/excited (Upstash Redis; see that route for the local-dev fallback).
 *
 * Renders neutral (not liked, count 0) on the server and on first client
 * paint, then reads this visitor's own prior toggle from localStorage and
 * fetches the real count in an effect, so the server-rendered HTML and the
 * first client render always match: the same hydration-safety rule CLAUDE.md
 * documents for `useReducedMotion()` timing applies to any state that can't
 * be known until the client mounts.
 */
export function ExcitedButton() {
  const reduce = useReducedMotion();
  const loaderDone = useLoaderState((s) => s.done);
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    // The server has no localStorage, so `liked` renders false until this
    // effect corrects it after mount: the same deferred-read shape CLAUDE.md
    // documents for `useReducedMotion()`, needed here to avoid a hydration
    // mismatch rather than to sync from a live external source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLiked(localStorage.getItem(STORAGE_KEY) === "1");
    fetch("/api/excited")
      .then((r) => r.json())
      .then((d: { count: number }) => setCount(d.count))
      .catch(() => {});
  }, []);

  const onChange = (nextLiked: boolean, nextCount: number) => {
    setCount(nextCount);
    localStorage.setItem(STORAGE_KEY, nextLiked ? "1" : "0");
    fetch("/api/excited", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liked: nextLiked }),
    }).catch(() => {});
  };

  return (
    <motion.div
      className="glass-pill rounded-pill"
      // Inline, not the `fixed bottom-6 right-6` utilities: .glass-pill's own
      // `position: relative` (globals.css) is an equal-specificity single
      // class selector, and whichever of the two rules lands later in the
      // compiled stylesheet wins, which silently dropped `fixed` here.
      // Inline styles always win over any class, regardless of source order.
      style={{ position: "fixed", bottom: 24, right: 24, zIndex: Z.nav }}
      initial={{ y: 16, opacity: 0 }}
      animate={loaderDone ? { y: 0, opacity: 1 } : { y: 16, opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
    >
      <PulseHeart
        liked={liked}
        count={count}
        onChange={onChange}
        icon={<Heart weight={liked ? "fill" : "regular"} />}
        label="I'm excited for DevFest Noida 2026"
        likedColor="#EA4335"
        idleColor="#9a9aa3"
        pillColor="transparent"
        textColor="#f5f5f7"
        size={22}
        corner={999}
      />
    </motion.div>
  );
}
