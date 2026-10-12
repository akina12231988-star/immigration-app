// 住所から郵便番号を引く（オンライン申請の「郵便番号」欄用）。
//
// 外国人・所属機関の登録には郵便番号の欄が無いので、住所の文字から
// 都道府県 → 市区町村 → 町域 の順に当てはめて郵便番号を出す。
// 市区町村・町域の一覧は HeartRails Geo API（無料・登録不要）からサーバー側で取り、
// ここは文字の当てはめだけを行う純関数にしてテストする。

export interface PostalTown {
  town: string; // 町域名（例: 郡築三番町、大字布田）
  postal: string; // 郵便番号（"866-0008" や "8660008"）
}

export interface PostalMatch {
  prefecture: string;
  city: string;
  town: string;
  postal: string; // 7桁の数字
}

// 住所の先頭の都道府県
export function prefectureOfAddress(address: string): string {
  const m = /^\s*(北海道|東京都|京都府|大阪府|.{2,3}?県)/.exec(address.normalize("NFKC"));
  return m ? m[1] : "";
}

// 都道府県のあとの部分から、一覧にある市区町村のうちいちばん長く一致するもの
export function matchCity(rest: string, cities: string[]): string {
  let best = "";
  for (const c of cities) {
    if (c && rest.startsWith(c) && c.length > best.length) best = c;
  }
  return best;
}

// 市区町村のあとの部分から、いちばん長く一致する町域。
// 「大字」「字」の有無や、数字の漢数字・算用数字の違いは無視して比べる
export function matchTown(rest: string, towns: PostalTown[]): PostalTown | null {
  const key = (s: string) => s.normalize("NFKC").replace(/^(大字|字)/, "").replace(/\s+/g, "");
  const r = key(rest);
  let best: PostalTown | null = null;
  for (const t of towns) {
    const k = key(t.town);
    if (k && r.startsWith(k) && (!best || k.length > key(best.town).length)) best = t;
  }
  // 町域が「以下に掲載がない場合」しか無い市町村はそれを使う
  if (!best) {
    const fallback = towns.find((t) => /以下に掲載がない場合/.test(t.town));
    if (fallback) best = fallback;
  }
  return best;
}

export function normalizePostal(s: string | null | undefined): string {
  const d = (s ?? "").normalize("NFKC").replace(/[^\d]/g, "");
  return d.length === 7 ? d : "";
}

// 住所 → 郵便番号。cities / towns は API から取った一覧（town の方は市区町村を決めてから取る）
export function resolvePostal(
  address: string,
  cities: string[],
  townsOf: (prefecture: string, city: string) => PostalTown[] | null,
): PostalMatch | null {
  const a = address.normalize("NFKC").replace(/\s+/g, "");
  const prefecture = prefectureOfAddress(a);
  if (!prefecture) return null;
  const afterPref = a.slice(prefecture.length);
  const city = matchCity(afterPref, cities);
  if (!city) return null;
  const towns = townsOf(prefecture, city);
  if (!towns) return null;
  const town = matchTown(afterPref.slice(city.length), towns);
  if (!town) return null;
  const postal = normalizePostal(town.postal);
  if (!postal) return null;
  return { prefecture, city, town: town.town, postal };
}
