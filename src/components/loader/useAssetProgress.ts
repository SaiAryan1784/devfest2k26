"use client";

import { useEffect, useState } from "react";
import { useMotionValue, type MotionValue } from "motion/react";

/** The things the first paint actually waits for, in the order the loader names them. */
export type AssetTask = "type" | "stage";
export type AssetTasks = Record<AssetTask, boolean>;

const NONE: AssetTasks = { type: false, stage: false };

/**
 * Real progress for the first paint, as named tasks: `type` (fonts ready) and
 * `stage` (window load). The hero is drawn in code, so there is no image to
 * wait for. Returns a MotionValue (0..1) for whatever draws the progress, the
 * per-task booleans (discrete state changes, never one per frame), and a done
 * flag.
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

  return { value, tasks, done: tasks.type && tasks.stage };
}
