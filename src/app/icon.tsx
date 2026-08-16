import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Reused for both `icon.tsx` and `apple-icon.tsx` — a rounded badge in the
 * game's dark-green/gold palette with the Lv1 fire-fox mascot ("スパーキット")
 * centered on top, echoing the title screen's gold sparkle branding. */
export function renderIcon(px: number) {
  const monsterPng = readFileSync(join(process.cwd(), "public/assets/monsters/sparkit_lv1.png"));
  const monsterDataUrl = `data:image/png;base64,${monsterPng.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #2a4a34 0%, #16281c 65%, #0e1720 100%)",
          borderRadius: px * 0.22,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori (ImageResponse) renders
        this JSX to a raster image itself; `next/image` doesn't work inside it. */}
        <img
          src={monsterDataUrl}
          alt=""
          width={px * 0.78}
          height={px * 0.78}
          style={{ filter: "drop-shadow(0 0 6px rgba(255,210,77,0.7))" }}
        />
      </div>
    ),
    { width: px, height: px },
  );
}

export default function Icon() {
  return renderIcon(size.width);
}

/** For the PWA manifest's "maskable" icon purpose — OSes crop maskable
 * icons into their own shape (circle, squircle, etc.), so unlike
 * `renderIcon` this is full-bleed (no `borderRadius`, the OS supplies its
 * own) and keeps the mascot within the ~80% "safe zone" so nothing
 * meaningful gets clipped by whatever mask shape is applied. */
export function renderMaskableIcon(px: number) {
  const monsterPng = readFileSync(join(process.cwd(), "public/assets/monsters/sparkit_lv1.png"));
  const monsterDataUrl = `data:image/png;base64,${monsterPng.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #2a4a34 0%, #16281c 65%, #0e1720 100%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori (ImageResponse) renders
        this JSX to a raster image itself; `next/image` doesn't work inside it. */}
        <img
          src={monsterDataUrl}
          alt=""
          width={px * 0.6}
          height={px * 0.6}
          style={{ filter: "drop-shadow(0 0 6px rgba(255,210,77,0.7))" }}
        />
      </div>
    ),
    { width: px, height: px },
  );
}
