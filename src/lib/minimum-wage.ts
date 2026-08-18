// 地域別最低賃金（時間額）との比較。
//
// 賃金が時給の人はその額、月給の人は時給換算した額が、就業場所の都道府県の
// 最低賃金以上かを確かめる。特定技能は「日本人と同等以上」が要件なので、
// 最低賃金割れは申請前に気づけるようにしておきたい。
//
// ※ 金額は令和7年度（2025年度）の地域別最低賃金。毎年10月ごろ改定されるため、
//   改定後はこの表を更新すること。画面には必ず「使った金額」を出して、
//   数字が違っていればすぐ気づけるようにしている。

export const MINIMUM_WAGE_YEAR_LABEL = "令和7年度";
export const MINIMUM_WAGE_NOTE =
  "令和7年度（2025年10月〜2026年3月に順次発効）の地域別最低賃金";

// 都道府県 → 時間額（円）
export const MINIMUM_WAGES: Record<string, number> = {
  北海道: 1075,
  青森県: 1029,
  岩手県: 1031,
  宮城県: 1038,
  秋田県: 1031,
  山形県: 1054,
  福島県: 1033,
  茨城県: 1074,
  栃木県: 1068,
  群馬県: 1063,
  埼玉県: 1141,
  千葉県: 1140,
  東京都: 1226,
  神奈川県: 1225,
  新潟県: 1050,
  富山県: 1067,
  石川県: 1054,
  福井県: 1053,
  山梨県: 1052,
  長野県: 1064,
  岐阜県: 1065,
  静岡県: 1097,
  愛知県: 1140,
  三重県: 1073,
  滋賀県: 1080,
  京都府: 1122,
  大阪府: 1177,
  兵庫県: 1116,
  奈良県: 1051,
  和歌山県: 1045,
  鳥取県: 1030,
  島根県: 1033,
  岡山県: 1058,
  広島県: 1085,
  山口県: 1043,
  徳島県: 1046,
  香川県: 1043,
  愛媛県: 1033,
  高知県: 1023,
  福岡県: 1057,
  佐賀県: 1030,
  長崎県: 1031,
  熊本県: 1034,
  大分県: 1035,
  宮崎県: 1023,
  鹿児島県: 1026,
  沖縄県: 1023,
};

export const PREFECTURES = Object.keys(MINIMUM_WAGES);

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
  const minimum = MINIMUM_WAGES[prefecture];
  if (!minimum) return null;
  return {
    prefecture,
    minimum,
    hourly,
    ok: hourly >= minimum,
    diff: hourly - minimum,
  };
}
