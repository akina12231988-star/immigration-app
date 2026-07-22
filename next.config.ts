import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 開発中にスマホ実機（LAN経由のIPアクセス）から動作確認できるようにする
  allowedDevOrigins: ["192.168.0.116", "192.168.0.0/24"],
  // 随時届出の様式テンプレートをサーバー側（APIルート）で読み込めるように、
  // サーバーレスデプロイ（Vercel等）のバンドルへ含める
  outputFileTracingIncludes: {
    "/api/resignation-forms": ["./public/forms/**"],
  },
};

export default nextConfig;
