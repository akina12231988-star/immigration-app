import { SSW_INDUSTRY_CATEGORIES } from "@/lib/industries";

// オンライン申請 2.4「従事すべき業務の内容 業務区分01」のプルダウン（分野ごと）。
// 画面の選択肢と同じ並びにそろえた分野はここに書く。無い分野は会社・機関マスタの業務区分（SSW_INDUSTRY_CATEGORIES）を使う
export const ONLINE_BUSINESS_CATEGORIES: Record<string, readonly string[]> = {
  介護: ["介護"],
  ビルクリーニング: ["ビルクリーニング"],
  リネンサプライ: ["リネンサプライ"],
  工業製品製造業: [
    "機械金属加工",
    "電気電子機器組立て",
    "金属表面処理",
    "紙器・段ボール箱製造",
    "コンクリート製品製造",
    "ＲＰＦ製造",
    "陶磁器製品製造",
    "印刷・製本",
    "紡織製品製造",
    "縫製",
    "電線・ケーブル製造",
    "プレハブ住宅製品製造",
    "家具製造",
    "定形・不定形耐火物製造",
    "生コンクリート製造",
    "ゴム製品製造",
    "かばん製造",
  ],
  建設: ["土木", "建築", "ライフライン・設備"],
  "造船・舶用工業": ["造船", "舶用機械", "舶用電気電子機器"],
};

// その分野の業務区分の選択肢（分野が分からなければ全分野の区分を並べる）
export function businessCategoryOptions(industry: string | null | undefined): string[] {
  // 「造船・船用工業」のように「舶」を「船」と書いた登録も同じ分野として扱う
  const key = (industry ?? "").normalize("NFKC").replace(/分野$/, "").replace("船用工業", "舶用工業").trim();
  const online = ONLINE_BUSINESS_CATEGORIES[key];
  if (online) return [...online];
  const master = SSW_INDUSTRY_CATEGORIES[key];
  if (master) return [...master];
  return [...new Set([...Object.values(ONLINE_BUSINESS_CATEGORIES).flat(), ...Object.values(SSW_INDUSTRY_CATEGORIES).flat()])];
}
