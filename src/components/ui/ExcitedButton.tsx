"use client";

import { RocketLaunch } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import PulseHeart from "@/components/reactbits/PulseHeart";
import { useLoaderState } from "@/lib/loader-state";
import { Z } from "@/lib/z";

const ID_KEY = "devfest-visitor-id";

/** A random anonymous id per browser, kept in localStorage. Not personal data. */
function visitorId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

/**
 * A floating "I'm excited" toggle, shared across every visitor via
 * /api/excited. The server is the source of truth for both the count and
 * whether *this* visitor has liked (it keeps a set of anonymous visitor ids),
 * so the button can never drift out of sync with the count, double-count, or
 * push it negative. localStorage only holds the anonymous id.
 *
 * Renders neutral (not liked, count 0) on the server and on first client
 * paint, then fetches the real state in an effect, so the server-rendered
 * HTML and the first client render always match.
 */
export function ExcitedButton() {
  const reduce = useReducedMotion();
  const loaderDone = useLoaderState((s) => s.done);
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    const id = visitorId();
    fetch(`/api/excited?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d: { count: number; liked: boolean }) => {
        setCount(d.count);
        setLiked(d.liked);
      })
      .catch(() => {});
  }, []);

  const onChange = (nextLiked: boolean, nextCount: number) => {
    if (busy.current) return;
    busy.current = true;
    const prev = { liked, count };
    // Optimistic, then reconciled with whatever the server says.
    setLiked(nextLiked);
    setCount(Math.max(0, nextCount));
    fetch("/api/excited", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: visitorId(), liked: nextLiked }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { count: number; liked: boolean }) => {
        setCount(d.count);
        setLiked(d.liked);
      })
      .catch(() => {
        setLiked(prev.liked);
        setCount(prev.count);
      })
      .finally(() => {
        busy.current = false;
      });
  };

  return (
    <motion.div
      className="glass-pill rounded-pill"
      // Inline, not the `fixed bottom-6 right-6` utilities: .glass-pill's own
      // `position: relative` (globals.css) is an equal-specificity single
      // class selector, and whichever of the two rules lands later in the
      // compiled stylesheet wins, which silently dropped `fixed` here.
      style={{ position: "fixed", bottom: 24, right: 24, zIndex: Z.nav }}
      initial={{ y: 16, opacity: 0 }}
      animate={loaderDone ? { y: 0, opacity: 1 } : { y: 16, opacity: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
    >
      <PulseHeart
        liked={liked}
        count={count}
        onChange={onChange}
        // Inline fill/stroke: PulseHeart strokes its icon (it was built for line
        // icons), but Phosphor glyphs are filled shapes, so stroking them
        // doubles every edge. Inline style beats PulseHeart's utility classes.
        icon={<RocketLaunch weight={liked ? "fill" : "regular"} style={{ fill: "currentColor", stroke: "none" }} />}
        label="I'm excited for DevFest Noida 2026"
        likedColor="#4285F4"
        idleColor="#9a9aa3"
        pillColor="transparent"
        textColor="#f5f5f7"
        size={30}
        corner={999}
      />
    </motion.div>
  );
}
