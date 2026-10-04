"use client";

import { LazyMotion, domAnimation } from "motion/react";

// Client leaf so the /dgl server layout can load Motion's DOM feature set once.
// `strict` makes any stray `motion.*` throw: DGL components use `m.*`.
export function DglMotion({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
