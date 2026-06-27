"use client";

import { useEffect, useState } from "react";

export function useDeferredReady(delayMs = 600) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, ready]);

  return ready;
}
