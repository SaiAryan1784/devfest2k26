"use client";

import { useEffect, useState } from "react";

/** True only for devices with an actual mouse: gates pointer-driven effects
 *  (the hero's proximity headline, the splash cursor) off touch/coarse pointers. */
export function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return fine;
}
