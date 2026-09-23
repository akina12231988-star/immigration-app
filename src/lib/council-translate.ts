// 協力確認書の一覧表（参考様式1-17号（別紙））の訳を、料金のかかる翻訳サービスを使わずに作る。
//
// 市区町村は、デジタル庁「アドレス・ベース・レジストリ」由来の住所データ
// （npm パッケージ jp-address-romaji-data・MIT。Geolonia 加工）から取り出した
// 都道府県・市区町村のローマ字（src/lib/data/municipality-romaji.json）を使い、
// 行政区分（県・市・町など）だけをその言語の言葉にする（例: クメール語「ខេត្ត Nagasaki, ទីក្រុង Unzen」）。
// 営業所名は「○○営業所」の○○が都道府県・市区町村・地方の名前ならローマ字にする。
// 辞書に無いもの（町名など）は日本語のまま出すので、画面で手で直して保存する。

import romajiData from "@/lib/data/municipality-romaji.json";
import { COUNCIL_DICT, type CouncilLang, type CouncilListRow, type CouncilTranslations } from "@/lib/council-list";

// 都道府県名 → [ローマ字, { 市区町村名 → [ローマ字, 郡名?, 郡のローマ字?] }]
type RomajiData = Record<string, [string, Record<string, [string, string?, string?]>]>;
const DATA = romajiData as unknown as RomajiData;

type CityKind = "市" | "町" | "村" | "区";

interface JpPlace {
  pref?: { name: string; r: string; hokkaido: boolean };
  county?: string; // 郡のローマ字（市区町村が分からないときだけ使う）
  city?: { r: string; kind: CityKind };
}

// 「長崎県雲仙市」「鹿児島県出水郡」「北海道安平町」「埼玉県児玉郡上里町」を都道府県・郡・市区町村に分ける
export function parseJpPlace(text: string): JpPlace | null {
  const s = text.replace(/\s|　/g, "");
  if (!s) return null;
  const prefName = Object.keys(DATA).find((p) => s.startsWith(p) || s.startsWith(p.replace(/[県府都]$/, "")));
  const prefs = prefName ? [prefName] : Object.keys(DATA);
  const rest = prefName ? s.slice(s.startsWith(prefName) ? prefName.length : prefName.length - 1) : s;
  for (const p of prefs) {
    const [prefR, cities] = DATA[p];
    const pref = prefName ? { name: p, r: prefR, hokkaido: p === "北海道" } : undefined;
    if (!rest) return pref ? { pref } : null;
    // 市区町村（郡つき・郡なしのどちらでも）
    for (const [city, [r, county]] of Object.entries(cities)) {
      if (rest === city || rest === `${county ?? ""}${city}` || rest.endsWith(city)) {
        return { pref, city: { r, kind: city.slice(-1) as CityKind } };
      }
    }
    // 郡だけ（例: 出水郡）
    const hit = Object.values(cities).find(([, county]) => county && rest.startsWith(county));
    if (hit) return { pref, county: hit[2] };
  }
  return prefName ? { pref: { name: prefName, r: DATA[prefName][0], hokkaido: prefName === "北海道" } } : null;
}

// 行政区分の言葉（言語ごと）。{n} にローマ字が入る
const UNITS: Record<CouncilLang, { pref: string; city: Record<CityKind, string>; county: string; join: string; order: "pref-first" | "city-first" }> = {
  km: { pref: "ខេត្ត {n}", city: { 市: "ទីក្រុង {n}", 町: "ឃុំ {n}", 村: "ភូមិ {n}", 区: "ខណ្ឌ {n}" }, county: "ស្រុក {n}", join: ", ", order: "pref-first" },
  vi: { pref: "tỉnh {n}", city: { 市: "Thành phố {n}", 町: "Thị trấn {n}", 村: "Làng {n}", 区: "Quận {n}" }, county: "Huyện {n}", join: ", ", order: "city-first" },
  id: { pref: "Prefektur {n}", city: { 市: "Kota {n}", 町: "Kota kecil {n}", 村: "Desa {n}", 区: "Distrik {n}" }, county: "Kabupaten {n}", join: ", ", order: "city-first" },
  tl: { pref: "{n}", city: { 市: "Lungsod ng {n}", 町: "Bayan ng {n}", 村: "Nayon ng {n}", 区: "Distrito ng {n}" }, county: "Distrito ng {n}", join: ", ", order: "city-first" },
  my: { pref: "{n} ခရိုင်", city: { 市: "{n} မြို့", 町: "{n} မြို့နယ်", 村: "{n} ကျေးရွာ", 区: "{n} ရပ်ကွက်" }, county: "{n} နယ်", join: "၊ ", order: "pref-first" },
  en: { pref: "{n}", city: { 市: "{n} City", 町: "{n} Town", 村: "{n} Village", 区: "{n} Ward" }, county: "{n} District", join: ", ", order: "city-first" },
};

const fill = (tpl: string, n: string) => tpl.replace("{n}", n);

// 市区町村の訳（辞書で分からなければ null）
export function romanizePlace(text: string, lang: CouncilLang): string | null {
  const p = parseJpPlace(text);
  if (!p || (!p.city && !p.county && !p.pref)) return null;
  const u = UNITS[lang];
  // 北海道は「道」を訳さずローマ字だけ（例: Hokkaido, ឃុំ Abira）
  const pref = p.pref ? (p.pref.hokkaido ? p.pref.r : fill(u.pref, p.pref.r)) : "";
  const local = p.city ? fill(u.city[p.city.kind], p.city.r) : p.county ? fill(u.county, p.county) : "";
  const parts = u.order === "pref-first" ? [pref, local] : [local, pref];
  return parts.filter(Boolean).join(u.join) || null;
}

// 地方の名前（営業所名に使われることが多いもの）
const REGIONS: Record<string, string> = {
  関東: "Kanto", 関西: "Kansai", 東北: "Tohoku", 九州: "Kyushu", 四国: "Shikoku", 中国: "Chugoku",
  北陸: "Hokuriku", 東海: "Tokai", 中部: "Chubu", 近畿: "Kinki", 甲信越: "Koshinetsu", 北関東: "Kitakanto",
};

// 営業所名の地名部分のローマ字（例: 鹿児島 → Kagoshima、北海道壮瞥 → Hokkaido Sobetsu、八代 → Yatsushiro）
function placeWordRomaji(word: string): string | null {
  if (!word) return null;
  if (REGIONS[word]) return REGIONS[word];
  for (const [pref, [prefR, cities]] of Object.entries(DATA)) {
    const short = pref === "北海道" ? pref : pref.replace(/[県府都]$/, "");
    if (word === pref || word === short) return prefR;
    if (word.startsWith(short)) {
      const tail = word.slice(short.length);
      const city = Object.entries(cities).find(([c]) => c.replace(/[市町村区]$/, "") === tail || c === tail);
      if (city) return `${prefR} ${city[1][0]}`;
    }
  }
  for (const [, [, cities]] of Object.entries(DATA)) {
    const city = Object.entries(cities).find(([c]) => c.replace(/[市町村区]$/, "") === word || c === word);
    if (city) return city[1][0];
  }
  return null;
}

const BRANCH_SUFFIX = /(営業所|支店|支社|事業所|工場|農場|出張所|センター)$/;
const BRANCH_WORD: Record<CouncilLang, string> = {
  km: "សាខា {n}",
  vi: "Chi nhánh {n}",
  id: "Kantor cabang {n}",
  tl: "Sangay ng {n}",
  my: "{n} ရုံးခွဲ",
  en: "{n} Branch",
};

// 営業所名の訳（辞書で分からなければ null）
export function romanizeBranch(branch: string, lang: CouncilLang): string | null {
  if (branch === "本社") return COUNCIL_DICT[lang].headOffice;
  const m = BRANCH_SUFFIX.exec(branch);
  const word = m ? branch.slice(0, -m[0].length) : branch;
  const r = placeWordRomaji(word);
  return r ? fill(BRANCH_WORD[lang], r) : null;
}

// ---- 表に出す訳（保存した訳 → 辞書 → 日本語のまま） ----

export function translateBranch(branch: string, lang: CouncilLang, saved: CouncilTranslations): string {
  if (!branch) return "";
  if (branch === "本社") return COUNCIL_DICT[lang].headOffice;
  return saved[lang]?.[branch] || romanizeBranch(branch, lang) || branch;
}

export function translateCity(city: string, lang: CouncilLang, saved: CouncilTranslations): string {
  if (!city) return "";
  return saved[lang]?.[city] || romanizePlace(city, lang) || city;
}

export function translateMethod(method: string, lang: CouncilLang, saved: CouncilTranslations): string {
  if (method === "メール") return COUNCIL_DICT[lang].mail;
  if (method === "提出した書面の控え") return COUNCIL_DICT[lang].copy;
  return method ? saved[lang]?.[method] || method : "";
}

// 辞書で自動に作れる訳（営業所名・市区町村）。画面の「自動の訳を欄に入れる」で使う
// 「○○営業所」などは営業所名、それ以外（長崎県雲仙市・北海道安平町など）は市区町村として訳す
export function autoTranslation(text: string, lang: CouncilLang): string {
  if (text === "本社" || BRANCH_SUFFIX.test(text)) return romanizeBranch(text, lang) ?? "";
  return romanizePlace(text, lang) ?? romanizeBranch(text, lang) ?? "";
}

// 画面で訳を確認・修正する文（本社・メール・提出した書面の控えは辞書で訳すので除く）
export function translationSources(rows: CouncilListRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.branch && r.branch !== "本社") set.add(r.branch);
    if (r.city) set.add(r.city);
    if (r.method && r.method !== "メール" && r.method !== "提出した書面の控え") set.add(r.method);
  }
  return [...set];
}
