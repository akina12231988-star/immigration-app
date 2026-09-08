import type { Metadata } from "next";
import { ResumeTool } from "./ResumeTool";

// 特定技能外国人の履歴書ツール（本人がスマホで入力して、日本語の履歴書PDFを作る）。
// 外国人本人が使うのでログイン不要（src/middleware.ts の対象外にしている）。
// 元は GitHub Pages（akina12231988-star.github.io/tokutei-rireki）で公開していた1枚のHTMLを、
// このシステムの中に TypeScript / React で作り直したもの。
//   ロジック … src/lib/resume-tool/（文言・選択肢・日付・翻訳・履歴書HTML）
//   取り込み … /workers/resume-import（履歴書PDFに埋め込んだデータを読んで外国人を登録）
//   翻訳     … /api/translate（同じサーバーなので設定不要。ANTHROPIC_API_KEY が要る）
export const metadata: Metadata = {
  title: "特定技能外国人の履歴書",
  description: "Resume for Specified Skilled Workers / Lý lịch / Riwayat Hidup",
  robots: { index: false },
};

export default function ResumePage() {
  return <ResumeTool />;
}
