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
  experimental: {
    // 一度表示したページを30秒間クライアント側に保持し、
    // 戻る・再訪時はサーバーの応答を待たずに即表示する
    // （登録・保存の操作は router.refresh() で最新化されるため影響しない）
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
