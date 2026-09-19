"use client";

import { useEffect, useState } from "react";
import { useMotionValue, type MotionValue } from "motion/react";

/** The things the first paint actually waits for, in the order the loader names them. */
export type AssetTask = "type" | "stage" | "video";
export type AssetTasks = Record<AssetTask, boolean>;

const NONE: AssetTasks = { type: false, stage: false, video: false };
/** The hero video gets this long to reach `canplay`; a slow line never stalls the opening. */
const VIDEO_WAIT_MS = 2500;

/** Resolves when the billboard's video can play, when there is none to wait for, or after the grace period. */
function videoReady(): Promise<void> {
  const v = document.querySelector<HTMLVideoElement>("[data-hero-video]");
  if (!v) return Promise.resolve();
  return new Promise<void>((resolve) => {
    if (v.readyState >= 3) return resolve();
    const done = () => resolve();
    v.addEventListener("canplay", done, { once: true });
    setTimeout(done, VIDEO_WAIT_MS);
  });
}

/**
 * Real progress for the first paint, as named tasks: `type` (fonts ready),
 * `stage` (window load) and `video` (the billboard's loop can play, or its
 * grace period is up). Returns a MotionValue (0..1) for whatever draws the
 * progress, the per-task booleans (discrete state changes, never one per
 * frame), and a done flag.
 */
export function useAssetProgress(): { value: MotionValue<number>; tasks: AssetTasks; done: boolean } {
  const value = useMotionValue(0);
  const [tasks, setTasks] = useState<AssetTasks>(NONE);

  useEffect(() => {
    let cancelled = false;
    const entries: [AssetTask, Promise<unknown>][] = [
      ["type", document.fonts?.ready ?? Promise.resolve()],
      [
        "stage",
        document.readyState === "complete"
          ? Promise.resolve()
          : new Promise<void>((r) => window.addEventListener("load", () => r(), { once: true })),
      ],
      ["video", videoReady()],
    ];
    let finished = 0;
    entries.forEach(([task, promise]) =>
      promise.then(() => {
        if (cancelled) return;
        finished += 1;
        value.set(finished / entries.length);
        setTasks((t) => ({ ...t, [task]: true }));
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [value]);

  return { value, tasks, done: tasks.type && tasks.stage && tasks.video };
}
