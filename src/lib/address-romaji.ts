// 日本の住所を英字（ローマ字）に直す。プロメトリックID取得の「住所」欄用。
//
// プロメトリックの申込画面は「すべて半角英数字・1項目30文字以内・@ - _ / . スペース 以外の記号は入力できない」。
// 欄は 電話番号 / ビル名・階 / 町村番地 / 市区 / 都道府県・州 / 郵便番号 に分かれている。
//
// 漢字の読みは推測しない。市区町村・町域の読み仮名は HeartRails Geo API（郵便番号の検索と同じ）から取り、
// ここではその読み仮名をヘボン式（パスポートと同じ。長音は書かない）に直すだけの純関数にしてテストする。

// 試験の申込（プロメトリック）の電話番号欄に入れる番号（こちらの連絡先。本人の番号は使わない）
export const PROMETRIC_PHONE = "07047135104";
// プロメトリックの住所欄は1項目30文字以内
export const PROMETRIC_ADDRESS_MAX = 30;

export const PREFECTURE_ROMAJI: Record<string, string> = {
  北海道: "Hokkaido", 青森県: "Aomori", 岩手県: "Iwate", 宮城県: "Miyagi", 秋田県: "Akita", 山形県: "Yamagata",
  福島県: "Fukushima", 茨城県: "Ibaraki", 栃木県: "Tochigi", 群馬県: "Gunma", 埼玉県: "Saitama", 千葉県: "Chiba",
  東京都: "Tokyo", 神奈川県: "Kanagawa", 新潟県: "Niigata", 富山県: "Toyama", 石川県: "Ishikawa", 福井県: "Fukui",
  山梨県: "Yamanashi", 長野県: "Nagano", 岐阜県: "Gifu", 静岡県: "Shizuoka", 愛知県: "Aichi", 三重県: "Mie",
  滋賀県: "Shiga", 京都府: "Kyoto", 大阪府: "Osaka", 兵庫県: "Hyogo", 奈良県: "Nara", 和歌山県: "Wakayama",
  鳥取県: "Tottori", 島根県: "Shimane", 岡山県: "Okayama", 広島県: "Hiroshima", 山口県: "Yamaguchi", 徳島県: "Tokushima",
  香川県: "Kagawa", 愛媛県: "Ehime", 高知県: "Kochi", 福岡県: "Fukuoka", 佐賀県: "Saga", 長崎県: "Nagasaki",
  熊本県: "Kumamoto", 大分県: "Oita", 宮崎県: "Miyazaki", 鹿児島県: "Kagoshima", 沖縄県: "Okinawa",
};

const YOON: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", しゃ: "sha", しゅ: "shu", しょ: "sho", ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo", ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo", じゃ: "ja", じゅ: "ju", じょ: "jo",
  ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo", びゃ: "bya", びゅ: "byu", びょ: "byo", ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
};
const KANA: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o", か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so", た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no", は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po", ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゔ: "vu",
};

// カタカナ → ひらがな
function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// 読み仮名 → ヘボン式ローマ字（小文字）。長音（おう・おお・うう・ー）は書かない（パスポートと同じ）
export function kanaToRomaji(kana: string): string {
  const s = toHiragana((kana ?? "").normalize("NFKC")).replace(/\s+/g, "");
  let out = "";
  let sokuon = false;
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    let r = "";
    if (YOON[two]) {
      r = YOON[two];
      i++;
    } else if (s[i] === "っ") {
      sokuon = true;
      continue;
    } else if (s[i] === "ー") {
      continue;
    } else {
      r = KANA[s[i]] ?? "";
    }
    if (!r) continue;
    if (sokuon) {
      out += r.startsWith("ch") ? "t" : r[0];
      sokuon = false;
    }
    // 長音を書かない: おう・おお → o、うう → u（「ゆう」「りゅう」なども u）
    if ((r === "u" && /[ou]$/.test(out)) || (r === "o" && /o$/.test(out))) continue;
    out += r;
  }
  return out;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// 市区町村名の英字。末尾の「市・区・町・村」と途中の「郡」は -shi / -ku / -machi・-cho / -mura・-son / -gun にする
// （例: 八代市 やつしろし → Yatsushiro-shi、上益城郡益城町 かみましきぐんましきまち → Kamimashiki-gun Mashiki-machi）
export function cityRomaji(city: string, cityKana: string): string {
  let kana = toHiragana((cityKana ?? "").normalize("NFKC")).replace(/\s+/g, "");
  if (!kana) return "";
  const parts: string[] = [];
  // 郡
  if (city.includes("郡")) {
    const i = kana.indexOf("ぐん");
    if (i > 0) {
      parts.push(`${capitalize(kanaToRomaji(kana.slice(0, i)))}-gun`);
      kana = kana.slice(i + 2);
    }
  }
  const suffixes: [RegExp, string, string][] = [
    [/区$/, "く", "ku"],
    [/市$/, "し", "shi"],
    [/町$/, "まち", "machi"],
    [/町$/, "ちょう", "cho"],
    [/村$/, "むら", "mura"],
    [/村$/, "そん", "son"],
  ];
  for (const [kanji, k, roman] of suffixes) {
    if (kanji.test(city) && kana.endsWith(k) && kana.length > k.length) {
      parts.push(`${capitalize(kanaToRomaji(kana.slice(0, -k.length)))}-${roman}`);
      return parts.join(" ");
    }
  }
  parts.push(capitalize(kanaToRomaji(kana)));
  return parts.join(" ");
}

// 町域名の英字（例: 郡築十一番町 ぐんちくじゅういちばんちょう → Gunchikujuichibancho）。
// 「◯丁目」で終わる町域は丁目を番地の前に回すので、chome（丁目の数字）を返す
const KANJI_DIGITS: Record<string, number> = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function kanjiNumber(s: string): number | null {
  const t = (s ?? "").normalize("NFKC");
  if (/^\d+$/.test(t)) return Number(t);
  if (!/^[〇一二三四五六七八九十]+$/.test(t)) return null;
  if (t.includes("十")) {
    const [a, b] = t.split("十");
    return (a ? (KANJI_DIGITS[a] ?? 0) : 1) * 10 + (b ? (KANJI_DIGITS[b] ?? 0) : 0);
  }
  return Number([...t].map((c) => KANJI_DIGITS[c]).join(""));
}
// 都道府県の英字（例: 熊本県 → Kumamoto-ken、東京都 → Tokyo-to、大阪府 → Osaka-fu、北海道 → Hokkaido）
export function prefectureRomaji(prefecture: string): string {
  const base = PREFECTURE_ROMAJI[prefecture] ?? "";
  if (!base) return "";
  if (prefecture.endsWith("県")) return `${base}-ken`;
  if (prefecture.endsWith("府")) return `${base}-fu`;
  if (prefecture.endsWith("都")) return `${base}-to`;
  return base;
}

// 数字の読み（候補をすべて。「いっちょうめ」「はっちょうめ」のような促音も含む）
const UNIT_KANA: Record<number, string[]> = {
  1: ["いち", "いっ"], 2: ["に"], 3: ["さん"], 4: ["よん", "し"], 5: ["ご"], 6: ["ろく", "ろっ"],
  7: ["なな", "しち"], 8: ["はち", "はっ"], 9: ["きゅう", "く"],
};
function numberKana(n: number): string[] {
  if (n < 1 || n > 99) return [];
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (tens === 0) return UNIT_KANA[unit] ?? [];
  const tenPrefix = tens === 1 ? [""] : (UNIT_KANA[tens] ?? []).filter((k) => !k.endsWith("っ"));
  const ten = unit === 0 ? ["じゅう", "じゅっ"] : ["じゅう"];
  const units = unit === 0 ? [""] : (UNIT_KANA[unit] ?? []);
  return tenPrefix.flatMap((p) => ten.flatMap((t) => units.map((u) => `${p}${t}${u}`)));
}
// 読みの末尾の「（数字の読み）＋suffix」を除く。除けなければ null
function stripNumberKana(kana: string, n: number, suffix: string): string | null {
  for (const k of numberKana(n).sort((a, b) => b.length - a.length)) {
    if (kana.endsWith(k + suffix)) return kana.slice(0, -(k + suffix).length);
  }
  return null;
}

export function townRomaji(town: string, townKana: string): { name: string; chome: number | null } {
  const t = (town ?? "").normalize("NFKC").replace(/^(大字|字)/, "");
  let kana = toHiragana((townKana ?? "").normalize("NFKC")).replace(/\s+/g, "").replace(/^(おおあざ|あざ)/, "");
  const m = /^(.*?)([〇一二三四五六七八九十\d]+)丁目$/.exec(t);
  let chome: number | null = null;
  if (m) {
    chome = kanjiNumber(m[2]);
    // 読みの末尾の「◯ちょうめ」を除く
    kana = (chome != null ? stripNumberKana(kana, chome, "ちょうめ") : null) ?? kana.replace(/ちょうめ$/, "");
  }
  // 「◯番町」で終わる町域は数字にする（例: 郡築十一番町 → Gunchiku 11-bancho）
  const b = /^(.*?)([〇一二三四五六七八九十\d]+)番町$/.exec(t);
  if (b) {
    const n = kanjiNumber(b[2]);
    const baseKana = n != null ? stripNumberKana(kana, n, "ばんちょう") : null;
    if (n != null && baseKana != null) {
      return { name: [capitalize(kanaToRomaji(baseKana)), `${n}-bancho`].filter(Boolean).join(" "), chome };
    }
  }
  return { name: capitalize(kanaToRomaji(kana)), chome };
}

// 町域のあとの番地・建物（「79番地2」→ 番地 79-2、「13-20日産共同住宅201号」→ 番地 13-20・建物 日産共同住宅201号）
export function splitHouseNumber(rest: string): { number: string; building: string } {
  const s = (rest ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—―ー−]/g, "-")
    .replace(/([〇一二三四五六七八九十]+)(?=(丁目|番地|番|号))/g, (k) => String(kanjiNumber(k) ?? k));
  const m = /^((?:\d+(?:丁目|番地|番|号|-|の)?)+)(.*)$/.exec(s);
  if (!m) return { number: "", building: s };
  const number = m[1]
    .replace(/丁目|番地|番|の/g, "-")
    .replace(/号/g, "")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
  return { number, building: m[2] };
}

// プロメトリックの欄に入れられない文字（半角英数字と @ - _ / . スペース 以外）があるか
export function hasInvalidPrometricChars(s: string): boolean {
  return /[^A-Za-z0-9@\-_/. ]/.test(s);
}

export interface PrometricAddress {
  building: string; // ビル名/階（英字に直せない建物名はそのまま出して直してもらう）
  street: string; // 町村番地（例: 79-2 Gunchiku 11-bancho）
  city: string; // 市区（例: Yatsushiro-shi）
  prefecture: string; // 都道府県/州（例: Kumamoto-ken）
  postal: string; // 郵便番号（例: 866-0034）
  warnings: string[];
}

// 住所と HeartRails の照合結果（読み仮名つき）から、プロメトリックの欄の値を組み立てる
export function buildPrometricAddress(input: {
  prefecture: string; // 熊本県
  city: string; // 八代市
  cityKana: string;
  town: string; // 郡築十一番町
  townKana: string;
  rest: string; // 町域のあと（79番地2）
  postal: string; // 7桁
}): PrometricAddress {
  const warnings: string[] = [];
  const { name: townName, chome } = townRomaji(input.town, input.townKana);
  const { number, building } = splitHouseNumber(input.rest);
  const num = [chome != null ? String(chome) : "", number].filter(Boolean).join("-");
  const street = [num, townName].filter(Boolean).join(" ");
  const city = cityRomaji(input.city, input.cityKana);
  const prefecture = prefectureRomaji(input.prefecture);
  const postal = /^\d{7}$/.test(input.postal) ? `${input.postal.slice(0, 3)}-${input.postal.slice(3)}` : "";
  // 建物名: 部屋番号だけなら英字で出せる。漢字・カナの建物名は直してもらう
  const bld = building.replace(/号室?$/, "");
  const buildingOut = bld;
  if (bld && hasInvalidPrometricChars(bld)) warnings.push(`建物名「${bld}」は英字に直して入れてください（部屋番号だけでもよい）`);
  for (const [label, v] of [["町村番地", street], ["市区", city]] as const) {
    if (v.length > PROMETRIC_ADDRESS_MAX) warnings.push(`${label}が${v.length}文字で30文字を超えています。短くしてください`);
  }
  if (!townName) warnings.push("町域の読みが分かりませんでした。町村番地を確認してください");
  // 政令市の区（熊本市中央区 など）は読みを市と区に分けられないので確認してもらう
  if (/市.+区$/.test(input.city)) warnings.push("市区は「Kumamoto-shi Chuo-ku」のように市と区の間を分けて確認してください");
  return { building: buildingOut, street, city, prefecture, postal, warnings };
}
