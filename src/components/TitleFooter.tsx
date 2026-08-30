"use client";

import { useEffect, useState } from "react";

/** Public URL of the deployed game. Override via NEXT_PUBLIC_SITE_URL
 * (e.g. a custom domain); falls back to the current Vercel alias. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "monster-merge-lime.vercel.app";

/**
 * Footer under the title menu: a copyright line (always shown) plus the
 * site URL (shown ONLY when the game is running as an installed PWA).
 *
 * In a normal browser tab the URL is already in the address bar, so
 * printing it again is just noise — but once installed to the home screen
 * the standalone window has no address bar, and there's no on-screen way
 * to see or share where the game lives. `display-mode: standalone` is the
 * standard signal for that; `navigator.standalone` is iOS Safari's
 * non-standard equivalent for home-screen web apps. Starts `false` so
 * server and first client render agree (no hydration mismatch), then the
 * effect flips it on the installed PWA.
 */
export default function TitleFooter() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const compute = () => setStandalone(mq.matches || iosStandalone);
    compute();
    mq.addEventListener("change", compute);
    return () => mq.removeEventListener("change", compute);
  }, []);

  return (
    <>
      {standalone && <p style={{ opacity: 0.5, fontSize: "0.72rem", margin: 0 }}>{SITE_URL}</p>}
      <p style={{ opacity: 0.4, fontSize: "0.72rem", margin: 0 }}>© 2026 がったいモンスターズ</p>
    </>
  );
}
