"use client";

import { useEffect } from "react";

// Registers the offline-shell worker for /dgl only. Production only: a worker caching dev output
// would serve stale pages. Registration failure is swallowed, the page never depends on it.
export function RegisterSw() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/dgl-sw.js", { scope: "/dgl" }).catch(() => {});
  }, []);
  return null;
}
