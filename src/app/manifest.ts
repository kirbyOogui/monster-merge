import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "がったいモンスターズ",
    short_name: "がったいモンスターズ",
    description: "4×4の盤面にモンスターを配置して合体させ、押し寄せる敵を迎え撃つブラウザゲーム",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1720",
    theme_color: "#16281c",
    icons: [
      { src: "/manifest-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/manifest-icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/manifest-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/manifest-icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
