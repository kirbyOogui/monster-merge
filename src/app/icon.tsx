import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Source logo art is a wide 1536×1024 (3:2) lettering lockup, not a square
 * mark — every icon here fits it by width and lets the aspect ratio decide
 * the height, rather than cropping any of the lettering off. */
const LOGO_ASPECT = 1024 / 1536;

function logoDataUrl(): string {
  const png = readFileSync(join(process.cwd(), "public/assets/title-logo.png"));
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Reused for both `icon.tsx` and `apple-icon.tsx` — the title logo
 * letterboxed on a rounded badge in the game's dark-green palette. */
export function renderIcon(px: number) {
  const dataUrl = logoDataUrl();
  const w = px * 0.86;
  const h = w * LOGO_ASPECT;

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
        <img src={dataUrl} alt="" width={w} height={h} />
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
 * own) and keeps the logo within the ~80% "safe zone" so nothing meaningful
 * gets clipped by whatever mask shape is applied. */
export function renderMaskableIcon(px: number) {
  const dataUrl = logoDataUrl();
  const w = px * 0.68;
  const h = w * LOGO_ASPECT;

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
        <img src={dataUrl} alt="" width={w} height={h} />
      </div>
    ),
    { width: px, height: px },
  );
}
