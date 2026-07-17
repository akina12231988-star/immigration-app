import type { MetadataRoute } from "next";

// ホーム画面追加（PWA）用のマニフェスト。
// アイコンは public/ の PNG を参照（差し替え可能）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "登録支援機関 業務管理システム",
    short_name: "業務管理",
    description: "登録支援機関の外国人・申請・支援業務を一元管理",
    start_url: "/",
    display: "standalone",
    background_color: "#16244d",
    theme_color: "#16244d",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
