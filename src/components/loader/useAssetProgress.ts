"use client";

import { useEffect, useState } from "react";
import { useMotionValue, type MotionValue } from "motion/react";

const CRITICAL_IMAGES = ["/brand/exports/spectrum.webp"];

/** The three things the first paint actually waits for, in the order the slate names them. */
export type AssetTask = "type" | "light" | "stage";
export type AssetTasks = Record<AssetTask, boolean>;

const NONE: AssetTasks = { type: false, light: false, stage: false };

/**
 * Real progress for the first paint, as three named tasks: `type` (fonts ready),
 * `light` (the hero's first lit edge decoded) and `stage` (window load). Returns a
 * MotionValue (0..1) for whatever draws the progress, the per-task booleans for
 * the loader's slate (three discrete state changes, never one per frame), and a
 * done flag.
 */
export function useAssetProgress(): { value: MotionValue<number>; tasks: AssetTasks; done: boolean } {
  const value = useMotionValue(0);
  const [tasks, setTasks] = useState<AssetTasks>(NONE);

  useEffect(() => {
    let cancelled = false;
    const entries: [AssetTask, Promise<unknown>][] = [
      ["type", document.fonts?.ready ?? Promise.resolve()],
      [
        "light",
        Promise.all(
          CRITICAL_IMAGES.map((src) => {
            const img = new Image();
            img.src = src;
            return img.decode().catch(() => undefined);
          }),
        ),
      ],
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

  return { value, tasks, done: tasks.type && tasks.light && tasks.stage };
}
