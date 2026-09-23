// 協力確認書の提出先の一覧表（所属機関等作成用3 V（別紙）・参考様式1-17号（別紙））。
// 所属機関の「協力確認書の提出」（事業所の所在地・住居地）から、営業所名・市区町村・提出年月日・
// 確認方法の表を作る。1-17号（別紙）は支援対象者の言語の訳を並べる。

import type { OrgCouncilSubmission } from "@/types/db";
import { councilMethodText } from "@/lib/organization-intake";

export interface CouncilListRow {
  branch: string; // 営業所名（例: 本社・愛野営業所）
  city: string; // 市区町村（例: 長崎県雲仙市）
  on: string; // 提出日 YYYY-MM-DD
  method: string; // 確認方法（メール / 提出した書面の控え / その他の内容）
}

// 提出先「（本社）長崎県雲仙市」を 営業所名「本社」と 市区町村「長崎県雲仙市」に分ける。
// 括弧が無ければ営業所名は空
export function splitCouncilTo(to: string): { branch: string; city: string } {
  const m = /^\s*[（(]([^）)]*)[）)]\s*(.*)$/.exec(to);
  if (m) return { branch: m[1].trim(), city: m[2].trim() };
  return { branch: "", city: to.trim() };
}

// 入力のある行だけを表の行にする
export function councilListRows(rows: OrgCouncilSubmission[]): CouncilListRow[] {
  return rows
    .filter((r) => r.to.trim() || r.on)
    .map((r) => ({ ...splitCouncilTo(r.to), on: r.on, method: councilMethodText(r) }));
}

// 一覧表を印刷できるか（事業所の所在地・住居地のどちらかで提出先が2か所以上）
export function canPrintCouncilList(office: OrgCouncilSubmission[], residence: OrgCouncilSubmission[]): boolean {
  return councilListRows(office).length >= 2 || councilListRows(residence).length >= 2;
}

// 日付の表記（日本語: 2025/4/22、訳: 22/4/2025）
export function councilDate(on: string, lang: CouncilLang | "ja"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(on);
  if (!m) return on;
  const [y, mo, d] = [m[1], Number(m[2]), Number(m[3])];
  return lang === "ja" ? `${y}/${mo}/${d}` : `${d}/${mo}/${y}`;
}

// ---- 1-17号（別紙）の訳 ----

export type CouncilLang = "vi" | "km" | "id" | "tl" | "my" | "en";

export const COUNCIL_LANGS: { code: CouncilLang; name: string }[] = [
  { code: "vi", name: "ベトナム語" },
  { code: "km", name: "クメール語" },
  { code: "id", name: "インドネシア語" },
  { code: "tl", name: "タガログ語" },
  { code: "my", name: "ミャンマー語" },
  { code: "en", name: "英語" },
];

// 国籍から言語の初期値
export function councilLangForNationality(nationality: string): CouncilLang {
  if (nationality.includes("ベトナム")) return "vi";
  if (nationality.includes("カンボジア")) return "km";
  if (nationality.includes("インドネシア")) return "id";
  if (nationality.includes("フィリピン")) return "tl";
  if (nationality.includes("ミャンマー")) return "my";
  return "en";
}

interface CouncilDict {
  office: string; // 支援対象者が活動する事業所の所在地
  residence: string; // 支援対象者の住居地
  branch: string; // 営業所名
  city: string; // 市区町村
  date: string; // 提出年月日
  method: string; // 確認方法
  headOffice: string; // 本社
  mail: string; // メール
  copy: string; // 提出した書面の控え
}

export const COUNCIL_DICT: Record<CouncilLang, CouncilDict> = {
  vi: {
    office: "Địa chỉ cơ sở nơi người được hỗ trợ làm việc",
    residence: "Nơi cư trú của người được hỗ trợ",
    branch: "Chi nhánh",
    city: "Thành phố / Quận / Thị trấn",
    date: "Ngày nộp",
    method: "Phương thức xác nhận",
    headOffice: "Trụ sở chính",
    mail: "Email",
    copy: "Bản sao văn bản đã nộp",
  },
  km: {
    office: "អាសយដ្ឋាននៃសាខាដែលអ្នកទទួលការគាំទ្រធ្វើសកម្មភាព",
    residence: "ទីលំនៅរបស់អ្នកទទួលការគាំទ្រ",
    branch: "សាខា",
    city: "ទីក្រុង / ស្រុក / ឃុំ",
    date: "ថ្ងៃខែឆ្នាំដាក់ស្នើ",
    method: "វិធីសាស្រ្តផ្ទៀងផ្ទាត់",
    headOffice: "ស្នាក់ការកណ្ដាល",
    mail: "អ៊ីមែល",
    copy: "ឯកសារដែលបានដាក់ស្នើ",
  },
  id: {
    office: "Lokasi kantor tempat penerima dukungan bekerja",
    residence: "Tempat tinggal penerima dukungan",
    branch: "Kantor cabang",
    city: "Kota / Kabupaten / Desa",
    date: "Tanggal pengajuan",
    method: "Metode konfirmasi",
    headOffice: "Kantor pusat",
    mail: "Email",
    copy: "Salinan dokumen yang diajukan",
  },
  tl: {
    office: "Lokasyon ng opisina kung saan nagtatrabaho ang tumatanggap ng suporta",
    residence: "Tirahan ng tumatanggap ng suporta",
    branch: "Sangay",
    city: "Lungsod / Bayan / Nayon",
    date: "Petsa ng pagsumite",
    method: "Paraan ng kumpirmasyon",
    headOffice: "Punong tanggapan",
    mail: "Email",
    copy: "Kopya ng isinumiteng dokumento",
  },
  my: {
    office: "ပံ့ပိုးမှုခံယူသူ လုပ်ကိုင်သည့် လုပ်ငန်းခွဲ၏ တည်နေရာ",
    residence: "ပံ့ပိုးမှုခံယူသူ၏ နေထိုင်ရာနေရာ",
    branch: "ရုံးခွဲ",
    city: "မြို့ / မြို့နယ် / ကျေးရွာ",
    date: "တင်သွင်းသည့်ရက်စွဲ",
    method: "အတည်ပြုနည်းလမ်း",
    headOffice: "ရုံးချုပ်",
    mail: "အီးမေးလ်",
    copy: "တင်သွင်းခဲ့သော စာရွက်စာတမ်းမိတ္တူ",
  },
  en: {
    office: "Location of the business office where the supported person works",
    residence: "Place of residence of the supported person",
    branch: "Office",
    city: "Municipality",
    date: "Date of submission",
    method: "Confirmation method",
    headOffice: "Head office",
    mail: "Email",
    copy: "Copy of submitted document",
  },
};

// 訳の保存（organizations.intake.council_i18n）: 言語 → 日本語の元の文 → 訳。
// 訳の作り方（辞書・ローマ字）は council-translate.ts（住所データを読むので、一覧表の画面だけで使う）
export type CouncilTranslations = Partial<Record<CouncilLang, Record<string, string>>>;

// 保存用に正規化（文字列だけを残す）
export function normalizeCouncilTranslations(raw: unknown): CouncilTranslations {
  const out: CouncilTranslations = {};
  if (!raw || typeof raw !== "object") return out;
  for (const { code } of COUNCIL_LANGS) {
    const v = (raw as Record<string, unknown>)[code];
    if (!v || typeof v !== "object") continue;
    const entries = Object.entries(v as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "",
    );
    if (entries.length > 0) out[code] = Object.fromEntries(entries);
  }
  return out;
}
