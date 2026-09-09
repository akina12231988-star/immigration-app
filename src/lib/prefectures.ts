// 都道府県の並び・地方・タイル地図の位置と、自治体名から都道府県を推定する処理。
// 郵送請求の自治体マスタ（地図＋県ごとの一覧）で使う。

// 北から南の公式の並び（JIS X 0401 の順）
export const PREFECTURE_LIST = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export type Prefecture = (typeof PREFECTURE_LIST)[number];

// 地方ごとのまとまり（一覧の見出しに使う）
export const PREFECTURE_REGIONS: { name: string; prefectures: Prefecture[] }[] = [
  { name: "北海道・東北", prefectures: ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"] },
  { name: "関東", prefectures: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"] },
  { name: "中部", prefectures: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"] },
  { name: "近畿", prefectures: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"] },
  { name: "中国・四国", prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"] },
  { name: "九州・沖縄", prefectures: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"] },
];

// タイル地図（日本列島を12列×12行の格子に簡略化）の位置 [列, 行]
export const PREFECTURE_TILES: Record<Prefecture, [number, number]> = {
  北海道: [9, 0],
  青森県: [9, 1],
  秋田県: [8, 2], 岩手県: [9, 2],
  山形県: [8, 3], 宮城県: [9, 3],
  石川県: [6, 4], 富山県: [7, 4], 新潟県: [8, 4], 福島県: [9, 4],
  福井県: [6, 5], 岐阜県: [7, 5], 長野県: [8, 5], 群馬県: [9, 5], 栃木県: [10, 5], 茨城県: [11, 5],
  島根県: [2, 6], 鳥取県: [3, 6], 兵庫県: [4, 6], 京都府: [5, 6], 滋賀県: [6, 6], 愛知県: [7, 6], 山梨県: [8, 6], 埼玉県: [9, 6], 東京都: [10, 6], 千葉県: [11, 6],
  山口県: [1, 7], 広島県: [2, 7], 岡山県: [3, 7], 大阪府: [4, 7], 奈良県: [5, 7], 三重県: [6, 7], 静岡県: [8, 7], 神奈川県: [10, 7],
  佐賀県: [0, 8], 福岡県: [1, 8], 大分県: [2, 8], 香川県: [4, 8], 徳島県: [5, 8], 和歌山県: [6, 8],
  長崎県: [0, 9], 熊本県: [1, 9], 宮崎県: [2, 9], 愛媛県: [4, 9], 高知県: [5, 9],
  鹿児島県: [1, 10],
  沖縄県: [0, 11],
};
export const PREFECTURE_TILE_COLS = 12;
export const PREFECTURE_TILE_ROWS = 12;

// タイルに出す短い名前（「県」などを外す。北海道はそのまま）
export function prefectureShortName(p: string): string {
  return p === "北海道" ? p : p.replace(/[都道府県]$/, "");
}

export function isPrefecture(s: string): s is Prefecture {
  return (PREFECTURE_LIST as readonly string[]).includes(s);
}

// 県名の無い自治体名から推定するための、市名→都道府県（県庁所在地と、よく使う市）
const CITY_PREFECTURES: Record<string, Prefecture> = {
  札幌市: "北海道", 青森市: "青森県", 盛岡市: "岩手県", 仙台市: "宮城県", 秋田市: "秋田県", 山形市: "山形県", 福島市: "福島県",
  水戸市: "茨城県", 宇都宮市: "栃木県", 前橋市: "群馬県", さいたま市: "埼玉県", 千葉市: "千葉県", 横浜市: "神奈川県",
  新潟市: "新潟県", 富山市: "富山県", 金沢市: "石川県", 福井市: "福井県", 甲府市: "山梨県", 長野市: "長野県", 岐阜市: "岐阜県", 静岡市: "静岡県", 名古屋市: "愛知県",
  津市: "三重県", 大津市: "滋賀県", 京都市: "京都府", 大阪市: "大阪府", 神戸市: "兵庫県", 奈良市: "奈良県", 和歌山市: "和歌山県", 御坊市: "和歌山県",
  鳥取市: "鳥取県", 松江市: "島根県", 岡山市: "岡山県", 広島市: "広島県", 山口市: "山口県",
  徳島市: "徳島県", 高松市: "香川県", 松山市: "愛媛県", 高知市: "高知県",
  福岡市: "福岡県", 佐賀市: "佐賀県", 長崎市: "長崎県", 大分市: "大分県", 宮崎市: "宮崎県", 鹿児島市: "鹿児島県", 那覇市: "沖縄県",
  // 熊本県（この事業で多い）
  熊本市: "熊本県", 八代市: "熊本県", 人吉市: "熊本県", 荒尾市: "熊本県", 水俣市: "熊本県", 玉名市: "熊本県", 山鹿市: "熊本県",
  菊池市: "熊本県", 宇土市: "熊本県", 上天草市: "熊本県", 宇城市: "熊本県", 阿蘇市: "熊本県", 天草市: "熊本県", 合志市: "熊本県",
};

// 自治体名から都道府県を推定する。
// 「愛知県あま市」→愛知県、「熊本市」「玉名市役所」→熊本県、分からなければ ""
export function guessPrefecture(name: string): Prefecture | "" {
  const s = (name ?? "").trim();
  if (!s) return "";
  const head = PREFECTURE_LIST.find((p) => s.startsWith(p));
  if (head) return head;
  const inside = PREFECTURE_LIST.find((p) => s.includes(p));
  if (inside) return inside;
  const city = s.replace(/(役所|役場)$/, ""); // 「玉名市役所」→「玉名市」
  const key = Object.keys(CITY_PREFECTURES).find((c) => city === c || city.startsWith(c));
  return key ? CITY_PREFECTURES[key] : "";
}

// 登録済みの都道府県があればそれを、無ければ名前から推定した都道府県を返す
export function effectivePrefecture(m: { name: string; prefecture?: string | null }): Prefecture | "" {
  const p = (m.prefecture ?? "").trim();
  if (isPrefecture(p)) return p;
  return guessPrefecture(m.name);
}

// 一覧の名札に出す短い名前（県名と「役所」を外す。「熊本市」はそのまま）
export function municipalityShortName(name: string, prefecture: string): string {
  let s = (name ?? "").trim();
  if (prefecture && s.startsWith(prefecture)) s = s.slice(prefecture.length);
  s = s.replace(/(役所|役場)$/, "");
  return s || name;
}

// 検索: 自治体名・都道府県・証明書名・備考のどれかに含まれれば一致（空白区切りはすべて含む）
export function matchesMunicipality(
  m: { name: string; prefecture?: string | null; cert_name?: string; note?: string },
  query: string,
): boolean {
  const words = (query ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [m.name, effectivePrefecture(m), m.cert_name ?? "", m.note ?? ""].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w.toLowerCase()));
}

// 都道府県ごとにまとめる（地方→県の順。都道府県が分からないものは最後に "" で）
export function groupByPrefecture<T extends { name: string; prefecture?: string | null }>(
  rows: T[],
): { prefecture: Prefecture | ""; region: string; rows: T[] }[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const p = effectivePrefecture(r);
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(r);
  }
  const out: { prefecture: Prefecture | ""; region: string; rows: T[] }[] = [];
  for (const region of PREFECTURE_REGIONS) {
    for (const p of region.prefectures) {
      const list = map.get(p);
      if (list) out.push({ prefecture: p, region: region.name, rows: list });
    }
  }
  const unknown = map.get("");
  if (unknown) out.push({ prefecture: "", region: "都道府県が未設定", rows: unknown });
  return out;
}

// 自治体を選ぶ候補の表示名。名前に県名が無ければ「熊本市（熊本県）」のように添えて、県名でも探せるようにする
export function municipalityOptionLabel(m: { name: string; prefecture?: string | null }): string {
  const p = effectivePrefecture(m);
  return p && !m.name.includes(p) ? `${m.name}（${p}）` : m.name;
}
