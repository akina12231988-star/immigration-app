// パスポート下部の機械読取領域（MRZ）の読み取り。ICAO Doc 9303 の TD3（2行×44文字）。
//
// 券面下部の2行をそのまま貼り付けてもらい、パスポート番号・国籍・氏名・生年月日・
// 性別・有効期限を取り出す。読み取れなかった項目は空のままにし、推測で埋めない。
//
// 個人情報そのものなので、この関数は受け取った文字列をログに出さない・保存しない。

export interface MrzResult {
  ok: boolean; // 形（2行44文字）として読めたか
  formatError: string | null; // 形が違うときの理由（読めたときは null）
  // 正規化したあとの2行（読めなかったときは空）。
  // 試験の申込などで転記するとき、画面から選んでコピーできるように残す
  line1: string;
  line2: string;
  passportNo: string;
  nationalityCode: string; // MRZの3文字コード（VNM など）
  nationality: string; // 日本語の国名（対応表に無ければ空）
  surname: string; // 姓
  givenNames: string; // 名（複数あれば空白区切り）
  birth: string; // YYYY-MM-DD（読めなければ空）
  sex: string; // 男 / 女（X・未設定は空）
  expiry: string; // YYYY-MM-DD（読めなければ空）
  // チェックディジットの検証結果。false が1つでもあれば読み取りを確認してもらう
  checks: {
    passportNo: boolean;
    birth: boolean;
    expiry: boolean;
    composite: boolean;
  };
  invalidChecks: string[]; // 合わなかったチェックディジットの名前（画面に出す）
}

// MRZの3文字国コード → 日本語の国名。
// 対応表に無いコードは国籍を空のままにする（勝手に決めない）。必要な国はここに足す。
export const MRZ_NATIONALITIES: Record<string, string> = {
  VNM: "ベトナム",
  KHM: "カンボジア",
  PHL: "フィリピン",
  IDN: "インドネシア",
  MMR: "ミャンマー",
  NPL: "ネパール",
  THA: "タイ",
  MNG: "モンゴル",
  LKA: "スリランカ",
  BGD: "バングラデシュ",
  LAO: "ラオス",
  CHN: "中国",
  KOR: "韓国",
  IND: "インド",
  UZB: "ウズベキスタン",
  PAK: "パキスタン",
  TWN: "台湾",
  JPN: "日本",
};

// 貼り付けた文字を MRZ の文字（A-Z 0-9 <）にそろえる。
// 改行・空白は取り除き、全角は半角にし、小文字は大文字にする。
// «（OCRで < が化けやすい）や記号の « » ＜ ＞ も < として扱う
export function normalizeMrz(text: string): string {
  return text
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[«»＜＞<>]/g, "<")
    .replace(/[^A-Z0-9<]/g, "");
}

// 1行目の末尾の < を44文字まで自動で埋める。
// 1行目の末尾は氏名のあとの埋め草（<）なので、途中まで入力しても安全に補完できる。
// 2行目は末尾がチェックディジットのため補完しない（44文字ちょうど必要）。
// 44文字を超えていて、はみ出しがすべて < なら切り落とす（< を入れすぎたとき用）
export function padMrzLine1(line: string): string {
  const v = normalizeMrz(line);
  if (!v) return "";
  if (v.length < 44) return v.padEnd(44, "<");
  if (v.length > 44 && /^<+$/.test(v.slice(44))) return v.slice(0, 44);
  return v;
}

// 貼り付けた2行を取り出す。改行が無くても88文字なら半分に割る
export function splitMrzLines(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => normalizeMrz(l))
    .filter((l) => l !== "");
  if (lines.length >= 2) return [lines[0], lines[1]];
  const joined = normalizeMrz(text);
  if (joined.length === 88) return [joined.slice(0, 44), joined.slice(44)];
  return lines;
}

// チェックディジットの計算（7-3-1 の重みづけ）。数字はその値、A=10〜Z=35、< は 0
export function mrzCheckDigit(value: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  [...value].forEach((c, i) => {
    let v = 0;
    if (c >= "0" && c <= "9") v = c.charCodeAt(0) - 48;
    else if (c >= "A" && c <= "Z") v = c.charCodeAt(0) - 55;
    sum += v * weights[i % 3];
  });
  return sum % 10;
}

// 値とチェックディジットが合っているか。
// 未使用欄（すべて <）はチェックディジットが < でも 0 でも正しいものとして扱う
function checkMatches(value: string, digit: string): boolean {
  if (/^<*$/.test(value) && (digit === "<" || digit === "0")) return true;
  return digit === String(mrzCheckDigit(value));
}

// MRZの YYMMDD を YYYY-MM-DD にする。
// 世紀は today（YYYY-MM-DD）を基準に決める:
//   生年月日 … 未来にならない方（2000年代にすると未来なら1900年代）
//   有効期限 … パスポートの有効期間は最長10年なので、
//             先すぎる日付（今年＋15年より後）になるときだけ1900年代にする
//             （期限切れのパスポートも読めるようにするため）
export function mrzDate(yymmdd: string, kind: "birth" | "expiry", today: string): string {
  if (!/^\d{6}$/.test(yymmdd)) return "";
  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return "";
  const thisYear = Number(today.slice(0, 4));
  const year =
    kind === "birth"
      ? 2000 + yy <= thisYear
        ? 2000 + yy
        : 1900 + yy
      : 2000 + yy <= thisYear + 15
        ? 2000 + yy
        : 1900 + yy;
  return `${year}-${mm}-${dd}`;
}

// 氏名欄（SURNAME<<GIVEN<NAMES<<<...）を姓と名に分ける。
// < は区切り（空白）として扱い、続いた区切りはまとめ、前後の空白は落とす
export function parseMrzName(field: string): { surname: string; givenNames: string } {
  const [rawSurname = "", rawGiven = ""] = field.split("<<");
  const clean = (s: string) => s.replace(/</g, " ").replace(/\s+/g, " ").trim();
  return { surname: clean(rawSurname), givenNames: clean(rawGiven) };
}

function emptyResult(formatError: string | null): MrzResult {
  return {
    ok: formatError === null,
    formatError,
    line1: "",
    line2: "",
    passportNo: "",
    nationalityCode: "",
    nationality: "",
    surname: "",
    givenNames: "",
    birth: "",
    sex: "",
    expiry: "",
    checks: { passportNo: false, birth: false, expiry: false, composite: false },
    invalidChecks: [],
  };
}

// MRZ（2行）を読み取る。today は世紀の判断に使う（YYYY-MM-DD）
export function parseMrz(text: string, today: string): MrzResult {
  const lines = splitMrzLines(text);
  if (lines.length < 2) {
    return emptyResult("2行になっていません。パスポート下部の2行を貼り付けてください。");
  }
  const [line1, line2] = lines;
  if (line1.length !== 44 || line2.length !== 44) {
    return emptyResult(
      `1行44文字ではありません（1行目 ${line1.length}文字・2行目 ${line2.length}文字）。パスポート（TD3）の2行を貼り付けてください。`,
    );
  }

  const result = emptyResult(null);
  result.line1 = line1;
  result.line2 = line2;

  // 1行目: P<（種別）＋発行国3文字＋氏名
  const { surname, givenNames } = parseMrzName(line1.slice(5));
  result.surname = surname;
  result.givenNames = givenNames;

  // 2行目
  const rawPassportNo = line2.slice(0, 9);
  const passportCheck = line2[9];
  const nationalityCode = line2.slice(10, 13);
  const rawBirth = line2.slice(13, 19);
  const birthCheck = line2[19];
  const sex = line2[20];
  const rawExpiry = line2.slice(21, 27);
  const expiryCheck = line2[27];
  const optional = line2.slice(28, 42);
  const optionalCheck = line2[42];
  const compositeCheck = line2[43];

  result.passportNo = rawPassportNo.replace(/</g, "");
  result.nationalityCode = nationalityCode.replace(/</g, "");
  result.nationality = MRZ_NATIONALITIES[result.nationalityCode] ?? "";
  result.birth = mrzDate(rawBirth, "birth", today);
  result.expiry = mrzDate(rawExpiry, "expiry", today);
  result.sex = sex === "M" ? "男" : sex === "F" ? "女" : "";

  result.checks = {
    passportNo: checkMatches(rawPassportNo, passportCheck),
    birth: checkMatches(rawBirth, birthCheck),
    expiry: checkMatches(rawExpiry, expiryCheck),
    composite: checkMatches(
      rawPassportNo + passportCheck + rawBirth + birthCheck + rawExpiry + expiryCheck + optional + optionalCheck,
      compositeCheck,
    ),
  };
  const labels: [keyof MrzResult["checks"], string][] = [
    ["passportNo", "パスポート番号"],
    ["birth", "生年月日"],
    ["expiry", "有効期限"],
    ["composite", "全体"],
  ];
  result.invalidChecks = labels.filter(([k]) => !result.checks[k]).map(([, label]) => label);
  return result;
}

// 画面でコピーできるようにする項目。
// パスポートの2行そのものと、読み取れた項目を1つずつ出す。
// 特定技能試験（プロメトリック）の申込などで、必要なところだけ写せるようにするため
export interface MrzCopyItem {
  label: string;
  value: string;
  mono: boolean; // 等幅で出すか（MRZの行・番号など）
}

export function mrzCopyItems(result: MrzResult): MrzCopyItem[] {
  if (!result.ok) return [];
  const items: MrzCopyItem[] = [
    { label: "MRZ 1行目", value: result.line1, mono: true },
    { label: "MRZ 2行目", value: result.line2, mono: true },
    { label: "パスポート番号", value: result.passportNo, mono: true },
    { label: "姓（Surname）", value: result.surname, mono: false },
    { label: "名（Given names）", value: result.givenNames, mono: false },
    { label: "氏名（姓 名）", value: [result.surname, result.givenNames].filter(Boolean).join(" "), mono: false },
    { label: "生年月日", value: result.birth, mono: true },
    { label: "性別", value: result.sex, mono: false },
    { label: "有効期限", value: result.expiry, mono: true },
    { label: "国籍コード", value: result.nationalityCode, mono: true },
    { label: "国籍", value: result.nationality, mono: false },
  ];
  return items.filter((i) => i.value !== "");
}

// 読み取り結果から、外国人フォームに入れる値を組み立てる（空の項目は入れない）。
// 氏名は在留カード・申請書と同じ「姓 名」の並びにする。
// MRZの2行も一緒に入れて保存する（0095）。保存しておくと、外国人詳細の
// パスポート枠でいつでも項目ごとにコピーできる（プロメトリック申込の転記用）
export function mrzToWorkerFields(result: MrzResult): Record<string, string> {
  const fields: Record<string, string> = {};
  const name = [result.surname, result.givenNames].filter(Boolean).join(" ");
  if (name) fields.name = name;
  if (result.passportNo) fields.passport_no = result.passportNo;
  if (result.nationality) fields.nationality = result.nationality;
  if (result.birth) fields.birth = result.birth;
  if (result.sex) fields.gender = result.sex;
  if (result.expiry) fields.passport_expiry_date = result.expiry;
  if (result.line1 && result.line2) fields.passport_mrz = `${result.line1}\n${result.line2}`;
  return fields;
}
