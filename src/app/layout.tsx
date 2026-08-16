import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "がったいモンスターズ",
  description: "4×4の盤面にモンスターを配置して合体させ、押し寄せる敵を迎え撃つブラウザゲーム",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "がったいモンスターズ",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the game's own background extend under the iOS notch/home-indicator
  // safe areas when installed as a standalone PWA, instead of leaving a
  // plain browser-chrome-colored bar there.
  viewportFit: "cover",
  themeColor: "#16281c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body suppressHydrationWarning>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
