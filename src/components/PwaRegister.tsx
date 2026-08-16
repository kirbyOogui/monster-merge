"use client";

import { useEffect } from "react";

/** Registers `public/sw.js` — required (alongside `manifest.ts`) for the
 * game to qualify as an installable PWA. Renders nothing. */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("Service worker registration failed", err);
    });
  }, []);

  return null;
}
