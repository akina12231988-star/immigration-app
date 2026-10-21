import { SSW_INDUSTRY_CATEGORIES } from "@/lib/industries";

// オンライン申請 2.4「従事すべき業務の内容 業務区分01」のプルダウン（分野ごと）。
// 画面の選択肢と同じ並び（全19分野）。無い分野名は会社・機関マスタの業務区分（SSW_INDUSTRY_CATEGORIES）を使う
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
  自動車整備: ["自動車の整備等"],
  航空: ["空港グランドハンドリング", "航空機整備"],
  宿泊: ["宿泊"],
  自動車運送業: ["トラック運転者", "タクシー運転者", "バス運転者"],
  鉄道: ["軌道整備", "電気設備整備", "車両整備", "車両製造", "運輸係員", "駅・車両清掃"],
  物流倉庫: ["物流倉庫"],
  農業: ["耕種農業", "畜産農業"],
  漁業: ["漁業", "養殖業"],
  飲食料品製造業: ["飲食料品製造業全般"],
  外食業: ["外食業"],
  林業: ["林業"],
  木材産業: ["木材産業"],
  資源循環: ["廃棄物処分業"],
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
