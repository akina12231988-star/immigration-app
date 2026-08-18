// 地域別最低賃金（時間額）との比較。
//
// 賃金が時給の人はその額、月給の人は時給換算した額が、就業場所の都道府県の
// 最低賃金以上かを確かめる。特定技能は「日本人と同等以上」が要件なので、
// 最低賃金割れは申請前に気づけるようにしておきたい。
//
// ┌─────────────────────────────────────────────────────────┐
// │ 毎年の更新のしかた（最低賃金は毎年10月ごろに改定されます）                │
// │                                                                         │
// │ 1. 厚生労働省「地域別最低賃金の全国一覧」を開く                          │
// │    https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/       │
// │    roudoukijun/minimumichiran/index.html                                 │
// │ 2. 「令和◯年度 地域別最低賃金 全国一覧」のPDFを保存する                  │
// │ 3. そのPDFを Claude に渡して「最低賃金を更新して」と伝える                 │
// │    （下の MINIMUM_WAGES と FISCAL_YEAR / YEAR_LABEL を差し替えます）      │
// │                                                                         │
// │ 更新時期になると、外国人詳細の賃金の欄に更新をうながす案内が出ます。       │
// └─────────────────────────────────────────────────────────┘

// この表の年度（西暦の開始年。令和7年度＝2025）
export const MINIMUM_WAGE_FISCAL_YEAR = 2025;
export const MINIMUM_WAGE_YEAR_LABEL = "令和7年度";
export const MINIMUM_WAGE_NOTE = "令和7年度の地域別最低賃金（厚生労働省の全国一覧）";
export const MINIMUM_WAGE_SOURCE_URL =
  "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/minimumichiran/index.html";

// 全国加重平均（参考）
export const MINIMUM_WAGE_NATIONAL_AVERAGE = 1121;

export interface MinimumWageEntry {
  hourly: number; // 時間額（円）
  effectiveOn: string; // 発効日 YYYY-MM-DD
}

// 都道府県 → 時間額と発効日（令和7年度 地域別最低賃金 全国一覧）
export const MINIMUM_WAGES: Record<string, MinimumWageEntry> = {
  北海道: { hourly: 1075, effectiveOn: "2025-10-04" },
  青森県: { hourly: 1029, effectiveOn: "2025-11-21" },
  岩手県: { hourly: 1031, effectiveOn: "2025-12-01" },
  宮城県: { hourly: 1038, effectiveOn: "2025-10-04" },
  秋田県: { hourly: 1031, effectiveOn: "2026-03-31" },
  山形県: { hourly: 1032, effectiveOn: "2025-12-23" },
  福島県: { hourly: 1033, effectiveOn: "2026-01-01" },
  茨城県: { hourly: 1074, effectiveOn: "2025-10-12" },
  栃木県: { hourly: 1068, effectiveOn: "2025-10-01" },
  群馬県: { hourly: 1063, effectiveOn: "2026-03-01" },
  埼玉県: { hourly: 1141, effectiveOn: "2025-11-01" },
  千葉県: { hourly: 1140, effectiveOn: "2025-10-03" },
  東京都: { hourly: 1226, effectiveOn: "2025-10-03" },
  神奈川県: { hourly: 1225, effectiveOn: "2025-10-04" },
  新潟県: { hourly: 1050, effectiveOn: "2025-10-02" },
  富山県: { hourly: 1062, effectiveOn: "2025-10-12" },
  石川県: { hourly: 1054, effectiveOn: "2025-10-08" },
  福井県: { hourly: 1053, effectiveOn: "2025-10-08" },
  山梨県: { hourly: 1052, effectiveOn: "2025-12-01" },
  長野県: { hourly: 1061, effectiveOn: "2025-10-03" },
  岐阜県: { hourly: 1065, effectiveOn: "2025-10-18" },
  静岡県: { hourly: 1097, effectiveOn: "2025-11-01" },
  愛知県: { hourly: 1140, effectiveOn: "2025-10-18" },
  三重県: { hourly: 1087, effectiveOn: "2025-11-21" },
  滋賀県: { hourly: 1080, effectiveOn: "2025-10-05" },
  京都府: { hourly: 1122, effectiveOn: "2025-11-21" },
  大阪府: { hourly: 1177, effectiveOn: "2025-10-16" },
  兵庫県: { hourly: 1116, effectiveOn: "2025-10-04" },
  奈良県: { hourly: 1051, effectiveOn: "2025-11-16" },
  和歌山県: { hourly: 1045, effectiveOn: "2025-11-01" },
  鳥取県: { hourly: 1030, effectiveOn: "2025-10-04" },
  島根県: { hourly: 1033, effectiveOn: "2025-11-17" },
  岡山県: { hourly: 1047, effectiveOn: "2025-12-01" },
  広島県: { hourly: 1085, effectiveOn: "2025-11-01" },
  山口県: { hourly: 1043, effectiveOn: "2025-10-16" },
  徳島県: { hourly: 1046, effectiveOn: "2026-01-01" },
  香川県: { hourly: 1036, effectiveOn: "2025-10-18" },
  愛媛県: { hourly: 1033, effectiveOn: "2025-12-01" },
  高知県: { hourly: 1023, effectiveOn: "2025-12-01" },
  福岡県: { hourly: 1057, effectiveOn: "2025-11-16" },
  佐賀県: { hourly: 1030, effectiveOn: "2025-11-21" },
  長崎県: { hourly: 1031, effectiveOn: "2025-12-01" },
  熊本県: { hourly: 1034, effectiveOn: "2026-01-01" },
  大分県: { hourly: 1035, effectiveOn: "2026-01-01" },
  宮崎県: { hourly: 1023, effectiveOn: "2025-11-16" },
  鹿児島県: { hourly: 1026, effectiveOn: "2025-11-01" },
  沖縄県: { hourly: 1023, effectiveOn: "2025-12-01" },
};

export const PREFECTURES = Object.keys(MINIMUM_WAGES);

// 次の改定の時期（毎年10月1日）を過ぎたら、表の更新をうながす
export function minimumWageUpdateDue(today: string): boolean {
  return today >= `${MINIMUM_WAGE_FISCAL_YEAR + 1}-10-01`;
}

// 住所の先頭から都道府県を読み取る（「熊本県八代市…」→「熊本県」）。
// 都道府県から始まっていない住所は、含まれている都道府県名を探す
export function prefectureFromAddress(address: string | null | undefined): string | null {
  const s = (address ?? "").trim();
  if (!s) return null;
  return PREFECTURES.find((p) => s.startsWith(p)) ?? PREFECTURES.find((p) => s.includes(p)) ?? null;
}

export interface MinimumWageCheck {
  prefecture: string;
  minimum: number; // その都道府県の最低賃金（時間額）
  effectiveOn: string; // その額の発効日
  hourly: number; // 比べた時給（時給そのもの、または月給からの換算）
  ok: boolean; // 最低賃金以上か
  diff: number; // 最低賃金との差（プラスなら上回っている）
}

// 時給が最低賃金以上かを確かめる。都道府県が分からない・時給が無いときは null
export function checkMinimumWage(
  hourly: number | null,
  prefecture: string | null,
): MinimumWageCheck | null {
  if (!hourly || !prefecture) return null;
  const entry = MINIMUM_WAGES[prefecture];
  if (!entry) return null;
  return {
    prefecture,
    minimum: entry.hourly,
    effectiveOn: entry.effectiveOn,
    hourly,
    ok: hourly >= entry.hourly,
    diff: hourly - entry.hourly,
  };
}
