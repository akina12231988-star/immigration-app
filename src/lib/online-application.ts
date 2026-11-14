import type { ApplicationCopyInput, CopyEdit, CopyGroup, CopyItem } from "@/lib/application-copy";
import { isKunisakiSeika } from "@/lib/stamp-fee";
import { cu, industryFieldName, it, og, ONLINE_INDUSTRY_FIELDS, SKILL_EVAL_KINDS, wk, wkDate, YES_NO, ymdCompact } from "@/lib/application-copy";
import { JLPT_LEVELS } from "@/lib/cert-exam";
import { ONLINE_MAIN_OCCUPATIONS } from "@/lib/online-main-occupations";
import { ONLINE_MAIN_INDUSTRIES, suggestedMainIndustry } from "@/lib/online-main-industries";
import { suggestedMainOccupation } from "@/lib/online-main-occupations";
import { CUSTODIAN_INFO, type CustodianInfo } from "@/lib/custody";
import { effectiveResidencePeriod } from "@/lib/residence-card";
import { contractPeriodEnd, contractYearsOf, formatYmdJa } from "@/lib/support-plan-dates";
import type { WorkHistory } from "@/types/ssw";

// 在留申請オンラインシステムの「手続き申込」画面に貼るためのデータ。
//
// 画面の項目順（身分事項 1〜16 → 区分V 18〜28 → 取次者 → 所属機関 2.1〜2.42・3.1〜3.57 →
// 登録支援機関 5.1〜5.16 → 受領方法等・フリー欄）に並べ、画面の入力形式に合わせた値にする。
//   ・日付は8桁（19940710）、職歴の年月は6桁（202205）
//   ・金額・電話番号・郵便番号は数字のみ（ハイフン・カンマ無し）
//   ・住所など「全角」の欄は英数字とハイフンを全角にする
//   ・氏名は半角大文字
// 紙の申請書向けの項目（application-copy.ts）から組み立てる。未登録の項目は edit（保存先）を付けてあるので、
// この一覧の上でもその場で入力・保存できる（外国人・所属機関・登録支援機関に保存される）。
// 「有／無」で運用が決まっている項目は、その値をそのまま出す（2.9 は必ず「有」など）。

export type OnlineFormat =
  | "text" // そのまま
  | "upper" // 半角大文字（氏名）
  | "zenkaku" // 全角（住所・本国の居住地など）
  | "date8" // YYYYMMDD
  | "ym6" // YYYYMM
  | "digits" // 数字のみ
  | "choice"; // プルダウン・ラジオボタン（表示文字で選ぶ）

export interface OnlineItem {
  no: string; // 画面の項目番号（"2.10" など。無い項目は ""）
  label: string;
  value: string; // 貼り付ける値（空なら未登録・手入力）
  format: OnlineFormat;
  note?: string; // 入力の注意・どこから取ったか
  manual?: boolean; // アプリに元の値が無く、画面で手入力・選択する項目
  skip?: boolean; // 画面で何も記載しない項目（空欄のまま）
  postalFor?: string; // この住所から郵便番号を自動で引く（画面側で /api/postal を呼んで値を入れる）
  edit?: CopyEdit; // この場で入力・編集して保存できる（保存先）
  editValue?: string; // 編集欄に最初に入れる値（登録されている元の値。表示値はハイフン無し・全角などに変えてあるため）
  error?: string; // 直さないといけないこと（赤字で出す。例: 申請取次士が未定）
  link?: { href: string; label: string; download?: boolean }; // 案内するファイル・画面（例: 協力確認書の別紙のPDF）
}

export interface OnlineSection {
  title: string;
  items: OnlineItem[];
}

// ---- 入力形式の変換 ----

// 数字だけにする（"096-279-3534" → "0962793534"、"1,100円" → "1100"）
export function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").replace(/[^\d]/g, "");
}

// 英数字・ハイフン・空白を全角にする（住所などの「全角」欄用）。日本語はそのまま
export function toZenkaku(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .replace(/[A-Za-z0-9]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0))
    .replace(/[-‐‑‒–—―ｰ]/g, "－")
    .replace(/ /g, "　");
}

// 氏名: 半角大文字・空白は1つ（"Nguyen  Thi Hong" → "NGUYEN THI HONG"）
export function upperName(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").toUpperCase().replace(/\s+/g, " ").trim();
}

// 年と月から6桁（"2022", "5" → "202205"）。YYYY-MM-DD からも作れる
export function ym6(y: string | null | undefined, m?: string | null): string {
  if (y && m == null) {
    const d = /^(\d{4})-(\d{2})/.exec(y.trim());
    return d ? `${d[1]}${d[2]}` : "";
  }
  const yy = digitsOnly(y);
  const mm = digitsOnly(m);
  if (yy.length !== 4 || !mm) return "";
  return `${yy}${mm.padStart(2, "0")}`;
}

// 所定労働時間（半角数字4文字以内・小数点は入力できない）。"40.0" → "40"、"37.5" → "37"、"173.33" → "173"。
// 「45時間08分」「45:08」は時間に直してから（数字だけ抜くと 4508 になってしまう）。小数点以下は切り捨てる
export function hours4(s: string | null | undefined): string {
  const raw = (s ?? "").normalize("NFKC").trim();
  const hm = raw.match(/^(\d+)\s*(?:時間|:)\s*(\d{1,2})\s*分?$/);
  const t = hm ? String(Number(hm[1]) + Number(hm[2]) / 60) : raw.replace(/[^\d.]/g, "");
  if (!t) return "";
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return "";
  return String(Math.floor(n)).slice(0, 4);
}

// 住所から都道府県名（「申請対象者の住居地」のプルダウン用）
export function prefectureOf(address: string | null | undefined): string {
  const m = /^(北海道|東京都|京都府|大阪府|.{2,3}?県)/.exec((address ?? "").trim());
  return m ? m[1] : "";
}

// 在留期間のプルダウン表記に寄せる（"6月" → "6月"、"1年6月" はそのまま）
export function residencePeriodChoice(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").replace(/か月|ヶ月|カ月/g, "月").replace(/\s+/g, "");
}

// 支払方法: 紙の「通貨払い／口座振込」→ 画面の「通貨払／口座振込み」
export function payMethodChoice(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (/通貨/.test(t)) return "通貨払";
  if (/振込/.test(t)) return "口座振込み";
  return t;
}

// 協力確認書のフリー欄の文章。提出があれば「有、提出日、提出先」の形で書く
export function councilFreeText(
  office: { to: string; on: string }[] | undefined,
  residence: { to: string; on: string }[] | undefined,
): string {
  const line = (rows: { to: string; on: string }[] | undefined) => {
    const filled = (rows ?? []).filter((r) => r.to || r.on);
    if (filled.length === 0) return "無";
    return `有、${filled.map((r) => `${r.on ? `${formatYmdJa(r.on)}提出` : "提出日未定"}、${r.to}${/長$/.test(r.to) ? "" : "長"}`).join("／")}`;
  };
  const any = [...(office ?? []), ...(residence ?? [])].some((r) => r.to || r.on);
  return [`１　${any ? "有" : "無"}`, `２（１）${line(office)}`, `（２）${line(residence)}`].join("\n");
}

// フリー欄は300文字以内
export const FREE_TEXT_MAX = 300;

// 協力確認書の提出先が多く、フリー欄（300文字）に入りきらない所属機関は、
// 「所属機関等作成用3 V（別紙）協力確認書」をPDFで添付し、フリー欄には「添付ファイルのとおり」と書く
export const COUNCIL_ATTACHMENT_NAME = "所属機関等作成用3 V(別紙）協力確認書";
export const COUNCIL_ATTACHMENT_FREE_TEXT = [
  "１　有",
  `２（１）有、${COUNCIL_ATTACHMENT_NAME}の添付ファイルのとおり`,
  `（２）有、${COUNCIL_ATTACHMENT_NAME}の添付ファイルのとおり`,
].join("\n");
// 別紙は、所属機関の「協力確認書の提出」の登録内容から印刷画面で作る（PDFで保存して添付する）
export const councilAttachmentUrl = (orgId: string) => `/organizations/${orgId}/council/print?form=3v`;
// 所属機関の詳細の「提出書類」タブの協力確認書の提出の欄（#council で開くとそのタブに切り替えて移動する）
export const COUNCIL_SECTION_ID = "council";
export const councilRegisterUrl = (orgId: string) => `/organizations/${orgId}#${COUNCIL_SECTION_ID}`;

// フリー欄（協力確認書）の項目。有限会社國崎青果は別紙を添付して「添付ファイルのとおり」と書く。
// ほかの所属機関で300文字を超えるときは、別紙を作って添付するよう知らせる
export function councilFreeItem(
  orgName: string | null | undefined,
  orgId: string | null | undefined,
  office: { to: string; on: string }[] | undefined,
  residence: { to: string; on: string }[] | undefined,
): OnlineItem {
  if (isKunisakiSeika(orgName)) {
    return {
      no: "",
      label: "フリー欄（協力確認書）",
      value: COUNCIL_ATTACHMENT_FREE_TEXT,
      format: "text",
      note: `協力確認書の提出先が多く300文字に入りきらないため、「${COUNCIL_ATTACHMENT_NAME}」をPDFにして、オンライン申請の添付資料として貼り付けてください（フリー欄には「添付ファイルのとおり」と書きます）。下のボタンで別紙の印刷画面を開き、PDFで保存できます。`,
      ...(orgId ? { link: { href: councilAttachmentUrl(orgId), label: `${COUNCIL_ATTACHMENT_NAME}を開く（PDFで保存して添付）` } } : {}),
    };
  }
  // 所属機関の情報で協力確認書の提出が未入力なら「無」にせず、エラーにして登録画面へのボタンを出す
  const hasRows = (rows: { to: string; on: string }[] | undefined) => (rows ?? []).some((r) => r.to || r.on);
  const missing = [
    hasRows(office) ? "" : "（１）活動する事業所の所在地",
    hasRows(residence) ? "" : "（２）住居地",
  ].filter(Boolean);
  if (missing.length > 0) {
    return {
      no: "",
      label: "フリー欄（協力確認書）",
      value: "",
      format: "text",
      note: "現在「特定技能」の人は協力確認書の有無を書く。300文字以内",
      error: `所属機関の情報で協力確認書の提出（${missing.join("・")}）が未入力です。所属機関の「提出書類」タブで提出先・提出日を登録してください（登録するとここに文章が出ます）。`,
      ...(orgId ? { link: { href: councilRegisterUrl(orgId), label: "所属機関の協力確認書の提出を登録する" } } : {}),
    };
  }
  const text = councilFreeText(office, residence);
  const over = text.length > FREE_TEXT_MAX;
  return {
    no: "",
    label: "フリー欄（協力確認書）",
    value: text,
    format: "text",
    note: "現在「特定技能」の人は協力確認書の有無を書く。300文字以内",
    ...(over
      ? {
          error: `${text.length}文字で300文字を超えています。協力確認書の別紙を作ってPDFで添付し、フリー欄には「${COUNCIL_ATTACHMENT_NAME}の添付ファイルのとおり」と書いてください。`,
          ...(orgId ? { link: { href: councilAttachmentUrl(orgId), label: `${COUNCIL_ATTACHMENT_NAME}を開く（PDFで保存して添付）` } } : {}),
        }
      : {}),
  };
}

// ---- 組み立て ----

const find = (groups: CopyGroup[], label: string): CopyItem | undefined =>
  groups.flatMap((g) => g.items).find((i) => i.label === label);
const val = (groups: CopyGroup[], label: string): string => find(groups, label)?.value ?? "";

const item = (
  no: string,
  label: string,
  value: string,
  format: OnlineFormat,
  note?: string,
  edit?: CopyEdit,
  editValue?: string,
): OnlineItem => ({
  no,
  label,
  value,
  format,
  note,
  edit,
  editValue: edit ? (editValue ?? value) : undefined,
});
// 紙の申請書の順の項目から値と保存先を引き継ぐ（値は画面の入力形式に変える）
const linked = (
  groups: CopyGroup[],
  no: string,
  label: string,
  paperLabel: string,
  format: OnlineFormat,
  note?: string,
  transform: (v: string) => string = (v) => v,
): OnlineItem => {
  const p = find(groups, paperLabel);
  return item(no, label, transform(p?.value ?? ""), format, note, p?.edit, p?.editValue ?? p?.value ?? "");
};
// 画面で何も記載しない項目
const skip = (no: string, label: string, note: string): OnlineItem => ({ no, label, value: "", format: "text", skip: true, note });
// 画面で確認して選ぶ項目（アプリに元の値が無い）。usual は「通常は〜」の案内
const choose = (no: string, label: string, usual?: string, note?: string): OnlineItem => ({
  no,
  label,
  value: "",
  format: "choice",
  manual: true,
  note: [usual ? `画面で選ぶ（通常は「${usual}」）` : "画面で選ぶ", note].filter(Boolean).join("。"),
});
// 住所から郵便番号を自動で引く項目（画面側で検索して値を入れる。住所が無ければ手入力）
const postal = (no: string, label: string, address: string | null | undefined, note?: string): OnlineItem => ({
  no,
  label,
  value: "",
  format: "digits",
  manual: !address,
  postalFor: (address ?? "").trim() || undefined,
  note: [address ? "住所から自動で検索（7桁・ハイフン無し）。違うときは画面の「住所検索」で確認" : "住所が未登録のため手入力", note]
    .filter(Boolean)
    .join("。"),
});
const manual = (no: string, label: string, note: string, format: OnlineFormat = "text"): OnlineItem => ({
  no,
  label,
  value: "",
  format,
  manual: true,
  note,
});

// オンラインシステムにログインしている利用者（取次者）のメールアドレス。
// 「通知送信用メールアドレス」にもこれを入れる（外国人本人ではなく、こちらで通知を受け取る）
export const ONLINE_SYSTEM_EMAIL = "thanhktc2017.visa@gmail.com";

// 在留カードの受領方法（受領方法等。この場で選んで保存できる）
export const CARD_RECEIPT_METHODS = ["郵送", "窓口"] as const;
// 認定申請（在留資格認定証明書交付申請）は、認定証明書を「メール」（電子）か「郵送」で受け取る
export const NINTEI_RECEIPT_METHODS = ["メール", "郵送"] as const;
// 窓口で受け取るときの受領官署
export const CARD_RECEIPT_OFFICE = "福岡出入国在留管理局 熊本出張所";

// 申請一覧のバッジに出す受領方法の文字（「受領 郵送」「受領 窓口（熊本出張所）」。未選択は空）
export function cardReceiptLabel(method: string | null | undefined): string {
  const m = (method ?? "").trim();
  if (m === "窓口") return "受領 窓口（熊本出張所）";
  if (m === "郵送") return "受領 郵送";
  if (m === "メール") return "受領 メール";
  return "";
}

// 特定活動（「特定技能１号」への移行準備）の変更申請の定型文（区分U）
export const TOKKATSU_ACTIVITY = "「特定技能１号」への移行準備";
export const TOKKATSU_REASON = "「特定技能１号」への移行準備のため";
export const TOKKATSU_PURPOSE =
  "「特定技能1号」へ移行予定であるが、準備に時間を要することから、就労予定の受入機関において「特定技能1号」で従事する業務と同様の業務に従事するもの。";

// 2.7・2.8 所定労働時間の注意書き（画面は小数点を受け付けない）
export const HOURS_NOTE = "半角数字4文字以内。小数点以下は入力できないので切り捨てています（40.5 → 40）";

// 画面で「有」「無」のどちらも選ばない項目に出す言い方
export const NEITHER = "有無どちらも選択しない";

// 27 分野に特有の基準（告示基準）が定められている分野
export const FIELD_SPECIFIC_INDUSTRIES = [
  "介護",
  "ビルクリーニング",
  "工業製品製造業",
  "建設",
  "造船・舶用工業",
  "自動車整備",
  "航空",
  "宿泊",
  "自動車運送業",
  "飲食料品製造業",
  "外食業",
  "林業",
  "木材産業",
] as const;

// 2.3 特定産業分野01: 「農業」→「農業分野」（プルダウンの表記）。分野が分からなければ ""
export function industryFieldChoice(industry: string | null | undefined): string {
  const name = industryFieldName(industry);
  if (!name) return "";
  // プルダウンに無い書き方でも「○○分野」にして出す（画面で近いものを選ぶ）
  return `${name}分野${(ONLINE_INDUSTRY_FIELDS as readonly string[]).includes(name) ? "" : "（プルダウンに無い分野。近いものを選ぶ）"}`;
}

// 2.17 雇用関係につき告示で定められる基準が定められている分野（有にする分野。それ以外はどちらも選ばない）
export const EMPLOYMENT_STANDARD_INDUSTRIES = ["工業製品製造業", "自動車運送業", "飲食料品製造業", "木材産業"] as const;
export function employmentStandardChoice(industry: string | null | undefined): string {
  return (EMPLOYMENT_STANDARD_INDUSTRIES as readonly string[]).includes(industryFieldName(industry)) ? "有" : NEITHER;
}

// 27 特定産業分野に特有の基準に適合していることの有無
export function fieldSpecificChoice(industry: string | null | undefined): string {
  return (FIELD_SPECIFIC_INDUSTRIES as readonly string[]).includes(industryFieldName(industry)) ? "有" : NEITHER;
}

// 26 技能実習で修得した技能等の本国への移転: 特定技能2号を希望するときだけ「有」
export function transferChoice(desiredStatus: string | undefined): string {
  return (desiredStatus ?? "").normalize("NFKC").includes("2号") ? "有" : NEITHER;
}

// 7 職業: 職歴のいちばん新しい行の「職種・仕事内容」。無ければ外国人の分野・職種
export function occupationOf(careers: { role?: string }[], field: string): string {
  const last = careers[careers.length - 1];
  return (last?.role ?? "").trim() || field;
}

// 14 更新（変更）の理由: 希望する在留資格から決まる定型文（決まらなければ ""）
export function renewalReasonText(desiredStatus: string | undefined): string {
  const s = (desiredStatus ?? "").normalize("NFKC");
  if (!s.includes("特定技能")) return "";
  return s.includes("2号") ? "2号特定技能外国人として就労するため" : "1号特定技能外国人として就労するため";
}

// 16.2〜16.8 同居している在日親族（人数分）。続柄・国籍はアプリに無いので画面で入れる。
// 認定申請（在留資格認定証明書交付申請）の画面では 21.2〜21.8 で、21.6 は「同居予定の有無」
export function relativeItems(
  relatives: { name: string; birth: string; workplace: string; residence_card_no: string }[],
  nintei = false,
): OnlineItem[] {
  const n = nintei ? "21" : "16";
  return relatives.flatMap((r, i) => {
    const nth = relatives.length > 1 ? `（${i + 1}人目）` : "";
    return [
      manual(`${n}.2`, `続柄${nth}`, "プルダウンから選ぶ（夫・妻・子 など）"),
      item(`${n}.3`, `氏名${nth}`, upperName(r.name), "upper", "旅券のとおり。半角大文字"),
      item(`${n}.4`, `生年月日${nth}`, ymdCompact(r.birth) ?? "", "date8"),
      manual(`${n}.5`, `国籍・地域${nth}`, "プルダウンから選ぶ"),
      nintei
        ? item(`${n}.6`, `同居予定の有無${nth}`, "有", "choice", "外国人詳細に登録しているのは同居する親族")
        : item(`${n}.6`, `同居の有無${nth}`, "有", "choice", "外国人詳細に登録しているのは同居している親族"),
      item(`${n}.7`, `勤務先・通学先${nth}`, toZenkaku(r.workplace), "zenkaku"),
      item(`${n}.8`, `在留カード番号${nth}`, (r.residence_card_no ?? "").normalize("NFKC").toUpperCase().replace(/\s+/g, ""), "upper"),
    ];
  });
}

export function buildOnlineApplication(input: ApplicationCopyInput, groups: CopyGroup[]): OnlineSection[] {
  const { worker: w, org, intake, histories, planDates } = input;
  const c: CustodianInfo = input.custodian ?? { ...CUSTODIAN_INFO };
  const es = planDates.es || w.employment_start_on || "";
  const eeYears = contractYearsOf(planDates); // 雇用契約の年数（既定2年。申請準備で3年を選べる）
  const ee = es ? contractPeriodEnd(es, eeYears) : "";
  const period = effectiveResidencePeriod(w);
  const total = find(groups, "21 申請時における特定技能1号での通算在留期間");
  const [totalY, totalM] = total?.parts ?? ["", ""];
  const careers = [...histories].sort((a, b) => (a.start < b.start ? -1 : 1));
  // 認定申請（在留資格認定証明書交付申請）は画面の項目番号・項目が違う（身分事項 1〜21・区分V 23〜34。支援計画 4.x は無い）
  const isNintei = (input.appType ?? "").includes("認定");

  const identity: OnlineItem[] = [
    item("1", "国籍・地域", w.nationality, "choice", "プルダウンから選ぶ", wk("nationality")),
    item("2", "生年月日", ymdCompact(w.birth) ?? "", "date8", "「生年月日に不明な点は無い」を選んでから8桁を入れる", wkDate("birth"), w.birth ?? ""),
    item("3", "氏名", upperName(w.name), "upper", "旅券のとおり。半角大文字・スペース区切り", wk("name"), w.name),
    item("4", "性別", w.gender, "choice", undefined, wk("gender", ["男", "女"])),
    item("5", "出生地", toZenkaku(w.home_address), "zenkaku", "本国における居住地と同じ", wk("home_address"), w.home_address),
    item("6", "配偶者の有無", w.has_spouse, "choice", undefined, wk("has_spouse", ["有", "無"])),
    item(
      "7",
      "職業",
      occupationOf(careers, w.field),
      "text",
      "職歴のいちばん新しい行の「職種・仕事内容」（無ければ分野・職種）。違うときは外国人詳細の職歴で直す。40文字以内",
      careers.length > 0 ? undefined : wk("field"),
      w.field,
    ),
    item("8", "本国における居住地", toZenkaku(w.home_address), "zenkaku", "全角80文字以内", wk("home_address"), w.home_address),
    postal("9.1", "日本における連絡先 郵便番号", w.address, "住居地の郵便番号"),
    item("9.2", "日本における連絡先 住居地", toZenkaku(w.address), "zenkaku", "全角85文字以内", wk("address"), w.address),
    item("9.3", "日本における連絡先 電話番号", digitsOnly(c.tel), "digits", "登録支援機関の電話番号（ハイフン無し）"),
    item("9.4", "日本における連絡先 携帯電話番号", "記載なし", "text", "本人の携帯番号は書かず「記載なし」"),
    item("", "メールアドレス（オンラインシステム利用者）", ONLINE_SYSTEM_EMAIL, "text", "ログインしている利用者（取次者）のメールアドレス。再入力欄にも同じものを入れる"),
    item("10.1", "旅券 (1)番号", (w.passport_no ?? "").normalize("NFKC").toUpperCase(), "upper", "半角英数字", wk("passport_no"), w.passport_no ?? ""),
    item("10.2", "旅券 (2)有効期限", ymdCompact(w.passport_expiry_date) ?? "", "date8", undefined, wkDate("passport_expiry_date"), w.passport_expiry_date ?? ""),
    item("11.1", "現に有する在留資格", w.residence_status, "choice", "プルダウンから選ぶ", wk("residence_status")),
    item("11.2", "在留期間", residencePeriodChoice(period), "choice", "プルダウンから選ぶ", wk("residence_period"), w.residence_period ?? ""),
    item("11.3", "在留期間の満了日", ymdCompact(w.residence_expiry_date) ?? "", "date8", undefined, wkDate("residence_expiry_date"), w.residence_expiry_date ?? ""),
    item("", "在留カードの有無", w.residence_card_no ? "有" : "", "choice"),
    item("12", "在留カード番号", (w.residence_card_no ?? "").normalize("NFKC").toUpperCase().replace(/\s+/g, ""), "upper", "半角英数字12文字", wk("residence_card_no"), w.residence_card_no ?? ""),
    item("13.1", "希望する在留資格", input.desiredStatus ?? "", "choice", "申請準備の申請種別から"),
    // 特定活動への資格変更は6月。雇用契約を3年で結んだときは、希望する在留期間も3年にする
    input.desiredStatus === "特定活動" && (input.appType ?? "").includes("変更")
      ? item("13.2", "希望する在留期間", "6月", "choice", "特定活動への在留資格変更なので6月")
      : eeYears === 3
      ? item("13.2", "希望する在留期間", "3年", "choice", "雇用契約期間を3年で結んだので3年。審査で変わることがある")
      : item("13.2", "希望する在留期間", residencePeriodChoice(period), "choice", "更新は通常いまと同じ期間。審査で変わることがある"),
    input.desiredStatus === "特定活動"
      ? item("14", "変更の理由", TOKKATSU_REASON, "text", "「特定技能１号」への移行準備の特定活動の定型文。600文字以内")
      : renewalReasonText(input.desiredStatus)
      ? item("14", "更新（変更）の理由", renewalReasonText(input.desiredStatus), "text", "希望する在留資格から決まる定型文。600文字以内")
      : manual("14", "更新（変更）の理由", "600文字以内。例: 1号特定技能外国人として就労するため"),
    // 15 犯罪歴: 紙の順で有無と内容を登録する。未登録なら「無」として出す
    item("15", "犯罪を理由とする処分を受けたことの有無", w.criminal_record || "無", "choice", w.criminal_record ? undefined : "未登録なので「無」としています。有なら鉛筆マークから選んで保存", wk("criminal_record", YES_NO), w.criminal_record ?? ""),
    ...(w.criminal_record === "有"
      ? [item("15", "処分の内容", w.criminal_record_note ?? "", "text", "処分を受けた年月・内容", wk("criminal_record_note"))]
      : []),
    // 16 在日親族: 外国人詳細の「在日親族の同居」と同居している在日親族から
    item(
      "16.1",
      "在日親族及び同居者 有無",
      w.relatives_in_japan ?? "",
      "choice",
      "外国人詳細 ＞ 在日親族の同居。「有」なら 16.2〜16.8 を人数分入れる（＋追加する。親族の氏名などは外国人詳細で登録）",
      wk("relatives_in_japan", YES_NO),
    ),
    ...relativeItems(w.relatives_in_japan === "有" ? (w.relatives ?? []) : []),
  ];

  const kubunV: OnlineItem[] = [
    // 18.1 評価区分: 登録した区分。無ければ合格証・専門級から推定
    item(
      "18.1",
      "技能水準 評価区分",
      w.skill_eval_kind ||
        (val(groups, "18 技能水準 (1)試験名") ? "特定技能評価試験" : val(groups, "18 専門級の合格名（技能実習）") ? "技能実習２号を良好に修了" : ""),
      "choice",
      w.skill_eval_kind ? "登録した区分。これにより 18.2〜18.8 の項目が変わる" : "未登録なので合格証・専門級から推定。鉛筆マークから選んで保存できる",
      wk("skill_eval_kind", SKILL_EVAL_KINDS),
      w.skill_eval_kind ?? "",
    ),
    linked(groups, "18", "技能水準 試験名", "18 技能水準 (1)試験名", "text"),
    linked(groups, "18", "技能水準 受験地", "18 (2)受験地", "text"),
    // 19.1 評価区分: 登録した区分。無ければ日本語の合格証から推定
    item(
      "19.1",
      "日本語能力 評価区分",
      w.japanese_eval_kind || (val(groups, "19.2 日本語能力 合格した試験名") ? "特定技能評価試験" : ""),
      "choice",
      w.japanese_eval_kind
        ? "登録した区分（特定技能1号のとき）。これにより 19.2〜 の項目が変わる"
        : "特定技能1号のとき。未登録なので日本語の合格証から推定。鉛筆マークから選んで保存できる",
      wk("japanese_eval_kind", SKILL_EVAL_KINDS),
      w.japanese_eval_kind ?? "",
    ),
    linked(groups, "19.2", "日本語能力 合格した試験名", "19.2 日本語能力 合格した試験名", "choice", "プルダウンから選ぶ（外国人詳細 ＞ 日本語の合格証の受験情報と同じ）"),
    linked(groups, "19", "日本語能力 受験地", "19 (2)受験地", "text"),
    item("19", "日本語能力 レベル", val(groups, "19 レベル"), "choice", undefined, wk("cert_nihongo_level", JLPT_LEVELS)),
    linked(groups, "20", "技能実習2号良好修了 職種名", "20 技能実習2号良好修了 (1)職種名", "text", "技能実習2号を良好に修了した人だけ"),
    linked(groups, "20", "技能実習2号良好修了 作業名", "20 (2)作業名", "text"),
    linked(groups, "20", "技能実習2号良好修了 証明方法", "20 (3)良好修了の証明方法", "choice"),
    item("21.1", "申請時における特定技能1号での通算在留期間（年数）", totalY, "choice", total?.asOf),
    item("21.2", "申請時における特定技能1号での通算在留期間（月数）", totalM, "choice", total?.asOf),
    // 22〜27 は運用で決めている選び方のとおりに出す
    item("22.1", "保証金の徴収・財産管理・違約金等の支払契約の有無", "無", "choice", "必ず「無」"),
    item("23.1", "外国の機関への費用支払について合意していることの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
    item("24", "国籍国等で定められる手続を経ていることの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
    item("25", "本邦で定期的に負担する費用について合意していることの有無", "有", "choice", "必ず「有」"),
    item("26", "技能実習で修得した技能等の本国への移転に努めることの有無", transferChoice(input.desiredStatus), "choice", "特定技能2号を希望するときだけ「有」。それ以外はどちらも選ばない"),
    item(
      "27",
      "特定産業分野に特有の基準に適合していることの有無",
      fieldSpecificChoice(val(groups, "2 (2)特定産業分野")),
      "choice",
      "介護・ビルクリーニング・工業製品製造業・建設・造船・舶用工業・自動車整備・航空・宿泊・自動車運送業・飲食料品製造業・外食業・林業・木材産業は「有」。それ以外はどちらも選ばない",
    ),
    item("", "職歴の有無", careers.length > 0 ? "有" : "無", "choice"),
    ...careers.flatMap((h, i) => {
      const n = String(i + 1).padStart(2, "0");
      return [
        item(`28.1`, `職歴 入社 年月${n}`, ym6(h.start), "ym6", "6桁（例 200101）"),
        item(`28.2`, `職歴 退社 年月${n}`, h.end ? ym6(h.end) : "", "ym6", h.end ? undefined : "在職中は空欄"),
        item(`28.3`, `職歴 勤務先 名称${n}`, toZenkaku(h.org), "zenkaku", "60文字以内"),
      ];
    }),
  ];

  // 取次者の氏名は申請準備の申請取次士。未定のままなら空欄にしてエラーを出す（登録支援機関の取次者で埋めない）。
  // 本人申請のときはこれまでどおり登録支援機関の申請取次者
  const agentName = input.agentName?.trim() ?? "";
  const agentNameItem: OnlineItem = agentName
    ? item("", "取次者(オンラインシステム利用者) (1)氏名", toZenkaku(agentName), "zenkaku", "申請準備の申請取次士（全角26文字以内）")
    : input.selfApply
      ? item(
          "",
          "取次者(オンラインシステム利用者) (1)氏名",
          toZenkaku(c.agentName),
          "zenkaku",
          "本人申請なので登録支援機関の申請取次者（全角26文字以内）",
        )
      : {
          ...item("", "取次者(オンラインシステム利用者) (1)氏名", "", "zenkaku", "全角26文字以内"),
          error: "申請取次士が未定です。申請準備の「申請取次士」で取次士を選んでください。",
        };
  const agent: OnlineItem[] = [
    agentNameItem,
    postal("", "取次者 (2)郵便番号", c.address, "登録支援機関の住所から"),
    item("", "取次者 (2)住所", toZenkaku(c.address), "zenkaku", "全角85文字以内", cu("address"), c.address),
    item("", "取次者 (3)所属機関等", c.officeName, "text", "256文字以内", cu("officeName")),
    item("", "取次者 (3)電話番号", digitsOnly(c.tel), "digits", undefined, cu("tel"), c.tel),
  ];

  const industryField = val(groups, "2 (2)特定産業分野");
  // あっせん「あり」のときだけ職業紹介事業者（2.30〜2.37）を入れる。未定なら値を出して案内する
  const placementOn = input.assen === "あり" ? true : input.assen === "なし" ? false : null;
  const placementNote = placementOn === null ? "あっせんが「あり」のときだけ入れる（申請準備の「あっせんについて」が未定）" : undefined;
  const placementItems: OnlineItem[] = [
    item("2.30", "(13)職業紹介事業者 氏名又は名称", toZenkaku(c.placementName), "zenkaku", placementNote ?? "全角60文字以内", cu("placementName"), c.placementName),
    choose("2.31", "(13)職業紹介事業者 法人番号の有無", "無", "法人なら「有」にして法人番号（13桁）を入れる"),
    item("2.32", "(13)職業紹介事業者 雇用保険適用事業所番号", digitsOnly(c.koyoNo), "digits", "登録支援機関の雇用保険適用事業所番号（11桁・ハイフン無し）", cu("koyoNo"), c.koyoNo),
    item("2.33", "(13)職業紹介事業者 郵便番号", digitsOnly(c.placementPostal), "digits", "7桁", cu("placementPostal"), c.placementPostal),
    item("2.34", "(13)職業紹介事業者 住所", toZenkaku(c.placementAddress), "zenkaku", "全角85文字以内", cu("placementAddress"), c.placementAddress),
    item("2.35", "(13)職業紹介事業者 電話番号", digitsOnly(c.placementTel), "digits", undefined, cu("placementTel"), c.placementTel),
    item("2.36", "(13)職業紹介事業者 許可・届出番号", toZenkaku(c.placementLicenseNo), "zenkaku", "全角16文字以内", cu("placementLicenseNo"), c.placementLicenseNo),
    item("2.37", "(13)職業紹介事業者 受理年月日", ymdCompact(c.placementLicensedOn) ?? "", "date8", undefined, cu("placementLicensedOn", "date"), c.placementLicensedOn),
  ];
  // 取次機関（2.38〜2.42）は認定申請のときだけ。外国人ごとに入力・保存する。
  // 画面では 2.39 が「国・地域」で、日本を選んだときだけ 2.40・2.41（郵便番号・住所）が出る
  const agencyItems: OnlineItem[] = [
    item("2.38", "(14)取次機関 氏名又は名称", toZenkaku(w.agency_name), "zenkaku", "職業紹介事業者のあっせんで情報の取次ぎをする機関（送出機関など）がある場合。全角60文字以内", wk("agency_name"), w.agency_name ?? ""),
    item("2.39", "(14)取次機関 国・地域", w.agency_name ? w.nationality : "", "choice", "プルダウンから選ぶ（送出機関なら通常は本人の国籍と同じ国）"),
    item("2.40", "(14)取次機関 郵便番号", digitsOnly(w.agency_postal), "digits", "2.39 で日本を選んだときだけ出る欄（国外の機関なら記載しない）。ハイフン無し", wk("agency_postal"), w.agency_postal ?? ""),
    item("2.41", "(14)取次機関 住所", toZenkaku(w.agency_address), "zenkaku", "2.39 で日本を選んだときだけ出る欄（国外の機関なら記載しない）。全角85文字以内", wk("agency_address"), w.agency_address ?? ""),
    item("2.42", "(14)取次機関 電話番号", digitsOnly(w.agency_tel), "digits", "半角数字12文字以内・ハイフン無し", wk("agency_tel"), w.agency_tel ?? ""),
  ];

  const contract: OnlineItem[] = [
    item("2.1", "特定技能雇用契約 (1)雇用契約期間(始期)", ymdCompact(es) ?? "", "date8", "雇用開始日（支援計画書の日付か外国人の雇用開始日）", wkDate("employment_start_on"), w.employment_start_on ?? ""),
    item("2.2", "特定技能雇用契約 (1)雇用契約期間(終期)", ymdCompact(ee) ?? "", "date8", `始期から${eeYears}年間（${eeYears}年後の前日）`),
    item("2.3", "(2)従事すべき業務の内容 特定産業分野01", industryFieldChoice(industryField), "choice", "プルダウンから選ぶ（所属機関の業種）", find(groups, "2 (2)特定産業分野")?.edit, org?.industry ?? ""),
    linked(groups, "2.4", "(2)従事すべき業務の内容 業務区分01", "2 (2)業務区分", "choice", "プルダウンから選ぶ"),
    w.main_occupation
      ? item("2.5", "(2)従事すべき業務の内容 職種 主たる職種", w.main_occupation, "choice", "登録した職種", wk("main_occupation", ONLINE_MAIN_OCCUPATIONS))
      : item(
          "2.5",
          "(2)従事すべき業務の内容 職種 主たる職種",
          "",
          "choice",
          `職種一覧から選んで保存${suggestedMainOccupation(org?.industry || industryFieldName(w.field)) ? `（この分野は通常「${suggestedMainOccupation(org?.industry || industryFieldName(w.field))}」）` : ""}`,
          wk("main_occupation", ONLINE_MAIN_OCCUPATIONS),
        ),
    linked(groups, "2.7", "(3)所定労働時間(週平均)", "2 (3)所定労働時間（週平均）", "digits", HOURS_NOTE, hours4),
    linked(groups, "2.8", "(3)所定労働時間(月平均)", "2 (3)所定労働時間（月平均）", "digits", HOURS_NOTE, hours4),
    item("2.9", "(3)所定労働時間が通常の労働者と同等であることの有無", "有", "choice", "必ず「有」"),
    item("2.10", "(4)月額報酬", digitsOnly(val(groups, "2 (4)月額報酬")), "digits", `申請準備中の所属機関の賃金（時給なら月給換算額、月給ならその月給）。${find(groups, "2 (4)月額報酬")?.note ?? ""}`),
    item("2.11", "(4)基本給の時間換算額", digitsOnly(val(groups, "2 (4)基本給の時間換算額")), "digits", "申請準備中の所属機関の賃金（時給ならその時給、月給なら時給換算額）"),
    linked(groups, "2.12", "(4)同等の業務に従事する日本人の月額報酬", "2 (4)同等の業務に従事する日本人の月額報酬", "digits", find(groups, "2 (4)同等の業務に従事する日本人の月額報酬")?.note, digitsOnly),
    item("2.13", "(4)報酬の額が日本人と同等以上であることの有無", "有", "choice", "必ず「有」"),
    linked(groups, "2.14", "(5)報酬の支払方法", "2 (5)報酬の支払方法", "choice", undefined, payMethodChoice),
    item("2.15", "(6)外国人であることを理由に異なった待遇としている事項の有無", "無", "choice", "必ず「無」"),
    item("2.16", "(7)一時帰国を希望した場合に有給休暇を取得させることの有無", "有", "choice", "必ず「有」"),
    item("2.17", "(8)雇用関係につき告示で定められる基準に適合していることの有無", employmentStandardChoice(industryField), "choice", "工業製品製造業・自動車運送業・飲食料品製造業・木材産業は「有」。それ以外はどちらも選ばない"),
    item("2.18", "(9)帰国旅費を負担し必要な措置をすることの有無", "有", "choice", "必ず「有」"),
    item("2.19", "(10)健康・生活の状況を把握するための措置を講ずることの有無", "有", "choice", "必ず「有」"),
    item("2.20", "(11)特定産業分野に特有の基準に適合していることの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
    skip("2.21〜2.29", "(12)派遣先", "何も記載しない（空欄のまま）"),
    ...(placementOn === false
      ? [skip("2.30〜2.37", "(13)職業紹介事業者", "あっせん「なし」のため何も記載しない")]
      : placementItems),
    ...(isNintei
      ? agencyItems
      : [skip("2.38〜2.42", "(14)取次機関", `認定申請のときだけ入れる（今回は${input.appType ? `${input.appType}申請` : "申請種別が未定"}のため記載しない）`)]),
  ];

  // 希望する在留資格が特定技能1号か（支援計画の委託・4.1〜4.16・3.36 は1号のときだけ「有」）
  const isSsw1 = /特定技能1号/.test((input.desiredStatus ?? "").normalize("NFKC"));
  const ssw1Choice = isSsw1 ? "有" : NEITHER;
  const SSW1_NOTE = isSsw1 ? "特定技能1号なので「有」" : "特定技能1号のときだけ「有」。それ以外はどちらも選ばない";

  // 3.20 労働保険番号（半角英数字・ハイフン無し）。入っていれば 3.19 は「有」にする
  const rosaiNo = (intake?.rosai_no ?? "").normalize("NFKC").replace(/[^0-9A-Za-z]/g, "");
  const organization: OnlineItem[] = [
    item("3.1", "特定技能所属機関 (1)氏名又は名称", toZenkaku(org?.name), "zenkaku", "全角60文字以内", org ? og("name") : undefined, org?.name ?? ""),
    item("3.2", "(2)法人番号の有無", org ? (org.corporate_no ? "有" : "無") : "", "choice"),
    item("3.2", "(2)法人番号", digitsOnly(org?.corporate_no), "digits", "13桁（法人でなければ空欄）", org ? og("corporate_no") : undefined, org?.corporate_no ?? ""),
    item("3.3", "(3)雇用保険適用事業所番号", digitsOnly(intake?.koyo_no), "digits", "11桁・ハイフン無しでコピー（登録はハイフンありでよい）。非該当なら空欄", org ? it("koyo_no") : undefined, intake?.koyo_no ?? ""),
    item(
      "3.4",
      "(4)業種 主たる業種",
      org?.main_industry ?? "",
      "choice",
      `プルダウンから選ぶ（所属機関の情報にも出ます）${!org?.main_industry && suggestedMainIndustry(org?.industry) ? `。この分野は通常「${suggestedMainIndustry(org?.industry)}」` : ""}`,
      org ? og("main_industry", ONLINE_MAIN_INDUSTRIES) : undefined,
    ),
    manual("3.6", "(4)業種 他業種01", "他に業種があればプルダウンから選ぶ", "choice"),
    postal("3.8", "(5)住所（所在地） 郵便番号", org?.address, "本店の住所から"),
    item("3.9", "(5)住所（所在地）", toZenkaku(org?.address), "zenkaku", "全角85文字以内", org ? og("address") : undefined, org?.address ?? ""),
    item("3.10", "(5)電話番号", digitsOnly(org?.contact), "digits", undefined, org ? og("contact") : undefined, org?.contact ?? ""),
    item("3.11", "(6)資本金", digitsOnly(intake?.capital), "digits", "円。13文字以内", org ? it("capital") : undefined, intake?.capital ?? ""),
    item("3.12", "(7)年間売上金額", digitsOnly(val(groups, "3 (7)年間売上金額（直近年度）")), "digits", "円。直近年度（所属機関 ＞ 決算情報で登録）"),
    item("3.13", "(8)常勤職員数", digitsOnly(val(groups, "3 (8)常勤職員数")), "digits", "名（所属機関 ＞ 常勤職員数で登録）"),
    item("3.14", "(9)代表者の氏名", toZenkaku(intake?.rep_name), "zenkaku", "全角26文字以内", org ? it("rep_name") : undefined, intake?.rep_name ?? ""),
    item("3.15", "(10)勤務させる事業所名", toZenkaku(org?.name), "zenkaku", "60文字以内", org ? og("name") : undefined, org?.name ?? ""),
    postal("3.16", "(10)勤務させる事業所 所在地 郵便番号", val(groups, "3 (10)所在地"), "事業所の所在地から"),
    item("3.17", "(10)勤務させる事業所 所在地", toZenkaku(val(groups, "3 (10)所在地")), "zenkaku", "全角85文字以内（会社の住所と別なら所属機関の「作業する住所」）", org ? it("work_address") : undefined, intake?.work_address ?? ""),
    linked(groups, "3.18", "(10)健康保険・厚生年金保険の適用事業所であることの有無", "健康保険及び厚生年金保険の適用事業所", "choice", "所属機関の保険（社会保険なら有）"),
    item(
      "3.19",
      "(10)労災保険・雇用保険の適用事業所であることの有無",
      rosaiNo ? "有" : val(groups, "労災保険及び雇用保険の適用事業所"),
      "choice",
      rosaiNo ? "3.20 の労働保険番号が入っているので「有」" : "3.20 の労働保険番号を入れると「有」になります（無ければ所属機関の労災・雇用保険の登録から）",
    ),
    item("3.20", "(10)労働保険番号", rosaiNo, "digits", "半角英数字18文字以内・ハイフン無しでコピー（登録はハイフンありでよい）。入れると 3.19 が「有」になります", org ? it("rosai_no") : undefined, intake?.rosai_no ?? ""),
    // 3.21〜3.43 は運用で決めている選び方のとおりに出す（欠格事由などは「無」、支援の体制は「有」）
    item("3.21", "(11)労働・社会保険・租税の法令に違反したことの有無", "無", "choice", "必ず「無」"),
    item("3.22", "(12)契約締結日前1年以内又は以後に同種の業務の労働者を非自発的に離職させたことの有無", "無", "choice", "必ず「無」"),
    item("3.23", "(13)責めに帰すべき事由により行方不明者を発生させたことの有無", "無", "choice", "必ず「無」"),
    item("3.24", "(14)機関・役員・支援責任者等が法令に違反して刑に処せられたことの有無", "無", "choice", "必ず「無」"),
    item("3.25", "(15)機関・役員・支援責任者等が精神の機能の障害を有することの有無", "無", "choice", "必ず「無」"),
    item("3.26", "(16)機関・役員・支援責任者等が破産手続開始の決定を受けて復権を得ないことの有無", "無", "choice", "必ず「無」"),
    item("3.27", "(17)機関・役員等が技能実習法の規定により実習認定を取り消されたことの有無", "無", "choice", "必ず「無」"),
    item("3.28", "(18)機関・役員・支援責任者等が実習認定を取り消された法人の役員であったことの有無", "無", "choice", "必ず「無」"),
    item("3.29", "(19)機関・役員・支援責任者等が法令に関し不正又は著しく不当な行為をしたことの有無", "無", "choice", "必ず「無」"),
    item("3.30", "(20)役員・支援責任者等が暴力団員であること又は5年以内に暴力団員であったことの有無", "無", "choice", "必ず「無」"),
    item("3.31", "(21)機関・役員・支援責任者等の法定代理人が(14)から(20)に該当することの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
    item("3.32", "(22)暴力団員又は5年以内に暴力団員であった者がその事業活動を支配する者であることの有無", "無", "choice", "必ず「無」"),
    item("3.33", "(23)外国人の活動内容に関する文書を契約終了の日から1年以上備えて置くことの有無", "有", "choice", "必ず「有」"),
    item("3.34", "(24)保証金の徴収その他財産管理又は違約金等の支払契約があることの認識の有無", "無", "choice", "必ず「無」"),
    item("3.35", "(25)特定技能雇用契約の不履行について違約金等の支払契約を締結していることの有無", "無", "choice", "必ず「無」"),
    item("3.36", "(26)1号特定技能外国人支援に要する費用を外国人に負担させないことの有無", ssw1Choice, "choice", "希望する在留資格が「特定技能1号」のときだけ「有」。それ以外はどちらも選ばない"),
    item("3.37", "(27)次のいずれかに該当することの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
    skip("3.38", "(27)該当する事項", "何も記載しない"),
    item("3.39", "(28)労働者派遣をすることとしている派遣先が(11)から(22)に該当していることの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
    item("3.40", "(29)労災保険加入等の措置の有無", "有", "choice", "必ず「有」。内容は下の項目"),
    item("3.40", "(29)労災保険加入等の措置の内容", val(groups, "(29)労災保険加入等の措置の内容"), "text", "所属機関の労災保険加入等の措置の内容（労災の適用事業所なら「労災保険加入」）", org ? it("rosai_measure") : undefined, intake?.rosai_measure ?? ""),
    item("3.41", "(30)特定技能雇用契約を継続して履行する体制が適切に整備されていることの有無", "有", "choice", "必ず「有」"),
    item("3.42", "(31)報酬額を振込又は確認できる方法で支払われていることの有無", "有", "choice", "必ず「有」"),
    item("3.43", "(32)適正な履行の確保につき告示で定められる基準に適合することの有無", "有", "choice", "必ず「有」"),
    item(
      "",
      isNintei
        ? "特定技能1号での入国を希望し登録支援機関に支援計画の全部の実施を委託することの有無"
        : "特定技能1号での在留を希望し登録支援機関に支援計画の全部の実施を委託することの有無",
      isSsw1 ? "委託する" : NEITHER,
      "choice",
      isSsw1
        ? `特定技能1号なので「委託する」。3.44〜3.57（自社支援の体制）は入力不要で、${isNintei ? "" : "4.1〜4.16 と "}5.1〜5.16 を入れる`
        : "特定技能1号のときだけ「委託する」",
    ),
    ...(isNintei
      ? [skip("3.44〜3.57", "(33)〜(41)支援責任者・支援担当者など（自社で支援するときの体制）", "登録支援機関に全部委託するときは何も記載しない")]
      : []),
  ];

  // 1号特定技能外国人支援計画（4.1〜4.16）。特定技能1号を希望するときは 4.14・4.16 以外すべて「有」
  const supportPlan: OnlineItem[] = [
    item("4.1", "(1)雇用契約の内容等を十分に理解できる言語による情報提供の実施の有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.2", "(2)上記(1)を対面又はテレビ電話装置その他の方法により行うこととしていることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.3", "(3)出入国時に港又は飛行場への送迎をすることとしていることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.4", "(4)適切な住居の確保に係る支援をすることとしていることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.5", "(5)預金口座等の生活に必要な契約に係る支援をすることとしていることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.6", "(6)本邦での生活一般に関する事項等を十分に理解できる言語により実施することの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.7", "(7)関係機関への同行その他の必要な措置を講ずることとしていることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.8", "(8)日本語を学習する機会を提供することとしていることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.9", "(9)理解できる言語により相談又は苦情の申出に対して必要な措置を講ずることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.10", "(10)外国人と日本人の交流の促進に係る支援をすることとしていることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.11", "(11)責めに帰すべき事由によらず契約を解除される場合は転職支援をすることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.12", "(12)支援責任者等が定期面談を実施し問題発生時は関係行政機関に通報することの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.13", "(13)支援計画を作成し当該外国人にその写しを交付することとしていることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.14", "(14)特定産業分野に特有の事情に鑑みて告示で定められる事項を支援計画に記載することの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
    item("4.15", "(15)支援の内容が適正な在留に資するものであって適切に実施できることの有無", ssw1Choice, "choice", SSW1_NOTE),
    item("4.16", "(16)支援計画の内容につき告示で定められる基準に適合していることの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
  ];

  const support: OnlineItem[] = [
    item("5.1", "登録支援機関 (1)氏名又は名称", toZenkaku(c.officeName), "zenkaku", "全角60文字以内", cu("officeName"), c.officeName),
    choose("5.2", "(2)法人番号の有無", "無", "法人なら「有」にして法人番号（13桁）を入れる"),
    item("5.3", "(3)雇用保険適用事業所番号", digitsOnly(c.koyoNo), "digits", "11桁・ハイフン無し", cu("koyoNo"), c.koyoNo),
    postal("5.4", "(4)郵便番号", c.headOfficeAddress, "登録支援機関（本店）の住所から"),
    item("5.5", "(4)所在地", toZenkaku(c.headOfficeAddress), "zenkaku", "全角85文字以内", cu("headOfficeAddress"), c.headOfficeAddress),
    item("5.6", "(4)電話番号", digitsOnly(c.tel), "digits", undefined, cu("tel"), c.tel),
    item("5.7", "(5)代表者の氏名", toZenkaku(c.representativeName), "zenkaku", "全角26文字以内", cu("representativeName"), c.representativeName),
    item("5.8", "(6)登録番号", toZenkaku(c.registrationNo).replace(/－/g, ""), "zenkaku", "全角。記号「－」は入力できないので除いてあります（２０登－００５７４６ → ２０登００５７４６）", cu("registrationNo"), c.registrationNo),
    item("5.9", "(7)登録年月日", ymdCompact(c.registeredOn) ?? "", "date8", undefined, cu("registeredOn", "date"), c.registeredOn),
    item("5.10", "(8)支援を行う事業所の名称", toZenkaku(c.supportOfficeName), "zenkaku", "全角60文字以内", cu("supportOfficeName"), c.supportOfficeName),
    postal("5.11", "(9)郵便番号", c.address, "支援を行う事業所の住所から"),
    item("5.12", "(9)所在地", toZenkaku(c.address), "zenkaku", "全角85文字以内", cu("address"), c.address),
    item("5.13", "(10)支援責任者名", toZenkaku(c.supportManagerName), "zenkaku", "全角26文字以内", cu("supportManagerName"), c.supportManagerName),
    item("5.14", "(11)支援担当者名", toZenkaku(c.supportStaffName), "zenkaku", "全角26文字以内", cu("supportStaffName"), c.supportStaffName),
    linked(groups, "5.15", "(12)対応可能言語", "5 (12)対応可能言語", "text", "60文字以内"),
    item("5.16", "(13)支援委託手数料(月額/人)", digitsOnly(intake?.support_fee), "digits", "円", org ? it("support_fee") : undefined, intake?.support_fee ?? ""),
  ];

  // 在留カードの受領方法（郵送／窓口）はこの場で選んで保存する。窓口なら受領官署に熊本出張所を出す。
  // 認定申請は在留カードではなく在留資格認定証明書の受け取りなので、「メール」か「郵送」から選ぶ（受領官署は選ばない）
  const receiptMethod = (w.card_receipt_method ?? "").trim();
  const receiptOffice: OnlineItem = isNintei
    ? {
        no: "",
        label: "受領官署",
        value: "",
        format: "choice",
        skip: true,
        note: "認定申請（認定証明書をメール・郵送で受け取る）のときは選ばない",
      }
    : receiptMethod === "窓口"
      ? item("", "受領官署", CARD_RECEIPT_OFFICE, "choice", "プルダウンから選ぶ（窓口で受け取るとき）")
      : receiptMethod === "郵送"
        ? {
            no: "",
            label: "受領官署",
            value: "",
            format: "choice",
            skip: true,
            note: `郵送のときは選ばない（在留カードの受領方法を「窓口」にすると「${CARD_RECEIPT_OFFICE}」が出ます）`,
          }
        : manual("", "受領官署", `在留カードの受領方法を「窓口」にすると「${CARD_RECEIPT_OFFICE}」が出ます（郵送なら選ばない）`, "choice");
  const receipt: OnlineItem[] = [
    isNintei
      ? item(
          "",
          "在留資格認定証明書の受領方法",
          receiptMethod,
          "choice",
          "ここでメールか郵送を選んで保存できます（認定申請のとき）",
          wk("card_receipt_method", NINTEI_RECEIPT_METHODS),
        )
      : item(
          "",
          "在留カードの受領方法",
          receiptMethod,
          "choice",
          "ここで郵送か窓口を選んで保存できます（通常は「郵送」。再入国許可申請を同時に申請するときは「窓口」）",
          wk("card_receipt_method", CARD_RECEIPT_METHODS),
        ),
    // 認定申請の画面には「申請対象者の住居地」「受領官署」の欄は無い
    ...(isNintei
      ? []
      : [item("", "申請対象者の住居地（都道府県）", prefectureOf(w.address), "choice", "プルダウンから選ぶ"), receiptOffice]),
    item("", "通知送信用メールアドレス", ONLINE_SYSTEM_EMAIL, "text", "オンラインシステムの利用者（取次者）のメールアドレス。再入力欄にも同じものを入れる"),
    choose("", "申請の意思の確認・申請内容の確認", "チェック", "2つのチェックを入れる"),
    councilFreeItem(org?.name, (org as { id?: string } | null)?.id, intake?.council_office_submissions, intake?.council_residence_submissions),
    manual("", "顔写真", "JPEG を添付（3か月以内に撮影）"),
  ];

  // 特定活動（「特定技能１号」への移行準備）の変更申請は、区分U（特定活動）の画面で出す
  if (input.desiredStatus === "特定活動" && !isNintei) {
    const staffNum = (v: string | undefined) => Number(digitsOnly(v)) || 0;
    const foreignStaff =
      staffNum(intake?.staff_trainee) + staffNum(intake?.staff_ssw1) + staffNum(intake?.staff_ssw2) + staffNum(intake?.staff_katsudo);
    const hasForeignStaff = [intake?.staff_trainee, intake?.staff_ssw1, intake?.staff_ssw2, intake?.staff_katsudo].some((v) => digitsOnly(v));
    const kubunU: OnlineItem[] = [
      item("17.1", "活動内容", TOKKATSU_ACTIVITY, "choice", "プルダウンから選ぶ（これにより 19.1 以降の項目が変わる）"),
      item("22", "具体的な在留目的", TOKKATSU_PURPOSE, "text", "滞在費支弁方法を含む。600文字以内"),
      skip("27.1〜27.6", "代理人（法定代理人による申請の場合）", "取次申請なので何も記載しない"),
    ];
    const orgU: OnlineItem[] = [
      item("1", "契約の形態", "雇用", "choice", "必ず「雇用」"),
      manual("3.1", "職種 主たる職種", "プルダウンから選ぶ（就労予定の受入機関で「特定技能１号」で従事する業務の職種）", "choice"),
      manual("3.2", "職種 他職種01", "他の職種があれば一覧から選ぶ（無ければ空欄）", "choice"),
      item("4", "活動内容詳細", TOKKATSU_PURPOSE, "text", "600文字以内"),
      choose("", "活動内容変更の有無（前回許可時以降）", "無", "前回許可時以降に職務内容の変更があったか"),
      item("5.1", "勤務先、所属機関又は通学先 (1)名称", org?.name ?? "", "text", "本店又は主たる事業所のもの。60文字以内", org ? og("name") : undefined),
      skip("5.2", "(1)支店・事業所名", "支店・事業所で働くときだけ入れる（60文字以内）"),
      item("", "(2)法人番号の有無", org ? (org.corporate_no ? "有" : "無") : "", "choice"),
      item("5.3", "(2)法人番号", digitsOnly(org?.corporate_no), "digits", "13桁（法人でなければ空欄）", org ? og("corporate_no") : undefined, org?.corporate_no ?? ""),
      item("5.4", "(3)雇用保険適用事業所番号", digitsOnly(intake?.koyo_no), "digits", "11桁・ハイフン無し。非該当事業所は空欄", org ? it("koyo_no") : undefined, intake?.koyo_no ?? ""),
      item("5.5", "(4)業種 主たる業種", org?.main_industry ?? "", "choice", "プルダウンから選ぶ", org ? og("main_industry", ONLINE_MAIN_INDUSTRIES) : undefined),
      manual("5.7", "(4)業種 他業種01", "他に業種があれば一覧から選ぶ", "choice"),
      postal("5.9", "(5)郵便番号", org?.address, "所在地から"),
      item("5.10", "(5)所在地", toZenkaku(org?.address), "zenkaku", "全角85文字以内", org ? og("address") : undefined, org?.address ?? ""),
      item("5.11", "(5)電話番号", digitsOnly(org?.contact), "digits", "ハイフン無し", org ? og("contact") : undefined, org?.contact ?? ""),
      item("5.12", "(6)資本金", digitsOnly(intake?.capital), "digits", "円。13文字以内（個人事業主は 0）", org ? it("capital") : undefined, intake?.capital ?? ""),
      item("5.13", "(7)年間売上高", digitsOnly(val(groups, "3 (7)年間売上金額（直近年度）")), "digits", "円。直近年度（所属機関 ＞ 決算情報で登録）"),
      item("5.14", "(8)従業員数", digitsOnly(val(groups, "3 (8)常勤職員数")), "digits", "名（所属機関 ＞ 常勤職員数で登録）"),
      item("5.15", "(8)うち外国人職員数", hasForeignStaff ? String(foreignStaff) : "", "digits", "名（所属機関 ＞ 常勤職員数の技能実習生・特定技能1号・2号・特定活動の合計）"),
      item("", "職務上の地位", "無", "choice", "役職が無ければ「無」"),
      item("7", "就労又は就学予定期間", "6", "digits", "か月（特定活動は6か月）"),
      item("8", "月額報酬", digitsOnly(val(groups, "2 (4)月額報酬")), "digits", `税引き前。各種手当・実費弁償を除く。${find(groups, "2 (4)月額報酬")?.note ?? ""}`),
      skip("", "同時申請種別選択", "再入国許可・資格外活動許可などを同時に申請しなければ選ばない"),
    ];
    const receiptU = receipt.map((i) =>
      i.label === "フリー欄（協力確認書）"
        ? { ...i, value: "", error: undefined, link: undefined, skip: true, note: "特定活動の申請では書かない（空欄のまま）" }
        : i,
    );
    return [
      { title: "身分事項（1〜16）", items: identity },
      { title: "区分U（特定活動）申請人に関する情報等（17〜27）", items: kubunU },
      { title: "取次者", items: agent },
      { title: "所属機関に関する情報等（1〜8）", items: orgU },
      { title: "受領方法等・フリー欄", items: receiptU },
    ];
  }

  // 認定・更新は、エクセルの申請書（申請人等作成用1〜3・所属機関等作成用1〜4）の番号・シート分けに合わせて出す
  if (isNintei) {
    return [
      { title: "申請人等作成用 1（1〜21 身分事項）", items: ninteiIdentity(input, careers, eeYears, es) },
      { title: "申請人等作成用 2・3 V（23〜34 技能水準・日本語・職歴など）", items: ninteiKubunV(input, groups, careers, totalY, totalM, total?.asOf) },
      { title: "取次者", items: agent },
      { title: "所属機関等作成用 1・2 V（2 特定技能雇用契約 2.1〜2.42）", items: contract },
      { title: "所属機関等作成用 2〜4 V（3 特定技能所属機関 3.1〜3.57）", items: organization },
      { title: "所属機関等作成用 4 V（4 1号特定技能外国人支援計画 4.1〜4.16）", items: ninteiSupportPlan(supportPlan) },
      { title: "所属機関等作成用 4 V（5 登録支援機関 5.1〜5.16）", items: support },
      { title: "受領方法等・フリー欄", items: receipt },
    ];
  }
  if ((input.appType ?? "").includes("更新")) {
    return [
      { title: "申請人等作成用 1（1〜16 身分事項）", items: koshinIdentity(identity) },
      {
        title: "申請人等作成用 2・3 V（18〜29 技能水準・日本語・職歴など）",
        items: [...kubunV, skip("29", "代理人（法定代理人による申請の場合）", "取次申請なので何も記載しない")],
      },
      { title: "取次者", items: agent },
      { title: "所属機関等作成用 1・2 V（2 特定技能雇用契約 2.1〜2.42）", items: contract },
      { title: "所属機関等作成用 2〜4 V（3 特定技能所属機関 3.1〜3.43）", items: organization },
      { title: "所属機関等作成用 4 V（4 1号特定技能外国人支援計画 4.1〜4.14）", items: koshinSupportPlan(supportPlan) },
      { title: "所属機関等作成用 4 V（5 登録支援機関 5.1〜5.16）", items: support },
      { title: "受領方法等・フリー欄", items: receipt },
    ];
  }

  return [
    { title: "身分事項（1〜16）", items: identity },
    { title: "区分V（18〜28・職歴）", items: kubunV },
    { title: "取次者", items: agent },
    { title: "特定技能雇用契約（2.1〜2.42）", items: contract },
    { title: "特定技能所属機関（3.1〜3.43）", items: organization },
    { title: "1号特定技能外国人支援計画（4.1〜4.16）", items: supportPlan },
    { title: "登録支援機関（5.1〜5.16）", items: support },
    { title: "受領方法等・フリー欄", items: receipt },
  ];
}

// ---- 更新申請（在留期間更新許可申請書）の番号 ----
// 申請人等作成用1は 1 国籍・地域 / 2 生年月日 / 3 氏名 / 4 性別 / 5 配偶者の有無 / 6 職業 / 7 本国における居住地 /
// 8 住居地 / 9 電話番号・携帯電話番号 / 10 旅券 / 11 現に有する在留資格・在留期間・満了日 / 12 在留カード番号 /
// 13 希望する在留期間 / 14 更新の理由 / 15 犯罪 / 16 在日親族。出生地・希望する在留資格の欄は無い
const KOSHIN_NO: Record<string, string> = {
  "6": "5", "7": "6", "8": "7", "9.1": "8", "9.2": "8", "9.3": "9", "9.4": "9",
  "11.1": "11", "11.2": "11", "11.3": "11", "13.2": "13",
};
const KOSHIN_LABEL: Record<string, string> = {
  "日本における連絡先 郵便番号": "住居地 郵便番号",
  "日本における連絡先 住居地": "住居地",
  "日本における連絡先 電話番号": "電話番号",
  "日本における連絡先 携帯電話番号": "携帯電話番号",
  "更新（変更）の理由": "更新の理由",
};
function koshinIdentity(identity: OnlineItem[]): OnlineItem[] {
  return identity
    .filter((i) => i.no !== "5" && i.no !== "13.1") // 出生地・希望する在留資格は更新の申請書に無い
    .map((i) => ({ ...i, no: KOSHIN_NO[i.no] ?? i.no, label: KOSHIN_LABEL[i.label] ?? i.label }));
}

// 更新の支援計画は (1) 送迎 〜 (14) の14項目（変更・認定の (1) 事前の情報提供・(2) 対面 が無い）
function koshinSupportPlan(plan: OnlineItem[]): OnlineItem[] {
  return plan
    .filter((i) => i.no !== "4.1" && i.no !== "4.2")
    .map((i) => {
      const n = Number(i.no.split(".")[1]) - 2;
      return { ...i, no: `4.${n}`, label: i.label.replace(/^\((\d+)\)/, `(${n})`) };
    });
}

// 認定の支援計画 (1) は「在留資格認定証明書の交付申請前の」情報提供
function ninteiSupportPlan(plan: OnlineItem[]): OnlineItem[] {
  return plan.map((i) =>
    i.no === "4.1" ? { ...i, label: "(1)在留資格認定証明書の交付申請前に、雇用契約の内容等を十分に理解できる言語で情報提供を実施したことの有無" } : i,
  );
}

// ---- 認定申請（在留資格認定証明書交付申請・区分V）の画面 ----
// 画面の項目（2026-11 時点の空の申込画面のPDFから）:
//   身分事項 1〜10（変更・更新と同じ）→ 11 入国目的 → 12 入国予定年月日 → 13 上陸予定港 → 14 滞在予定期間 →
//   15 同伴者 → 16 査証申請予定地 → 17 過去の出入国歴 → 18 過去の認定申請歴 → 19 犯罪 → 20 退去強制 → 21 在日親族
//   区分V 23 技能水準 → 24 日本語 →（25 良好に修了した技能実習2号）→ 26 通算在留期間 → 27〜32 → 33 職歴 →
//   34 申請人等（取次申請は入力しない）
// 値の入れ方は、これまでエクセルの認定申請書（申請人等作成用1〜3・所属機関等作成用1〜4）に書いていたやり方に合わせる:
//   ・9 日本における連絡先は所属機関（勤務先）の住所・電話番号、携帯電話は無し
//   ・11 入国目的は「Ｖ 特定技能（1号）」、13 上陸予定港は福岡空港、14 滞在予定期間は雇用契約期間、15 同伴者は無
//   ・16 査証申請予定地はベトナムならハノイ（「HA NOI - VIET NAM」）
//   ・17 過去の出入国歴は技能実習などで日本にいたことがあれば有（回数・直近の出入国は画面で入れる）
//   ・23・24 は技能実習2号を良好に修了なら 25 に職種・作業・証明方法（3級の技能検定など）を書く
//   ・34 は取次申請なので書かない

// 16 査証申請予定地: 国籍から決まるもの（無ければ空。画面で入れる）
export const VISA_PLACE_BY_NATIONALITY: { match: RegExp; place: string }[] = [
  { match: /ベトナム|viet\s*nam/i, place: "HA NOI - VIET NAM" },
];
export function visaApplyPlace(nationality: string | null | undefined): string {
  const n = (nationality ?? "").normalize("NFKC");
  return VISA_PLACE_BY_NATIONALITY.find((v) => v.match.test(n))?.place ?? "";
}

// 13.1 上陸予定港（いつも福岡空港から入国している）
export const NINTEI_PORT_OF_ENTRY = "福岡空港";

function ninteiIdentity(input: ApplicationCopyInput, careers: WorkHistory[], eeYears: number, es: string): OnlineItem[] {
  const w = input.worker;
  const org = input.org;
  // 日本における連絡先: 本人はまだ日本に住んでいないので、所属機関（勤務先）の住所・電話番号を書く
  const contactAddress = org?.address ?? "";
  const contactNote = "所属機関（勤務先）の住所";
  // 17 過去の出入国歴: 職歴に日本での在留（技能実習・特定技能など。本国での職歴・無職以外）があれば「有」
  const stayedInJapan = careers.some((h) => h.visa !== "本国での職歴" && h.visa !== "無職");
  const visaPlace = visaApplyPlace(w.nationality);
  const ssw2 = /2号/.test((input.desiredStatus ?? "").normalize("NFKC"));
  return [
    item("1", "国籍・地域", w.nationality, "choice", "プルダウンから選ぶ", wk("nationality")),
    item("2", "生年月日", ymdCompact(w.birth) ?? "", "date8", "「生年月日に不明な点は無い」を選んでから8桁を入れる", wkDate("birth"), w.birth ?? ""),
    item("3", "氏名", upperName(w.name), "upper", "旅券のとおり。半角大文字・スペース区切り（104文字以内）", wk("name"), w.name),
    item("4", "性別", w.gender, "choice", undefined, wk("gender", ["男", "女"])),
    item("5", "出生地", w.home_address, "text", "40文字以内（本国における居住地と同じ）", wk("home_address"), w.home_address),
    item("6", "配偶者の有無", w.has_spouse, "choice", undefined, wk("has_spouse", ["有", "無"])),
    item(
      "7",
      "職業",
      occupationOf(careers, w.field),
      "text",
      "職歴のいちばん新しい行の「職種・仕事内容」（無ければ分野・職種）。違うときは外国人詳細の職歴で直す。40文字以内",
      careers.length > 0 ? undefined : wk("field"),
      w.field,
    ),
    item("8", "本国における居住地", toZenkaku(w.home_address), "zenkaku", "全角80文字以内", wk("home_address"), w.home_address),
    postal("9.1", "日本における連絡先 郵便番号", contactAddress, contactNote),
    item("9.2", "日本における連絡先 居住地", toZenkaku(contactAddress), "zenkaku", `全角85文字以内。${contactNote}`, org ? og("address") : undefined, org?.address ?? ""),
    item("9.3", "日本における連絡先 電話番号", digitsOnly(org?.contact), "digits", "所属機関（勤務先）の電話番号（ハイフン無し）", org ? og("contact") : undefined, org?.contact ?? ""),
    item("9.4", "日本における連絡先 携帯電話番号", "記載なし", "text", "本人はまだ日本の携帯電話が無いので「記載なし」"),
    item("9.5", "メールアドレス", ONLINE_SYSTEM_EMAIL, "text", "オンラインシステム利用者（取次者）のメールアドレス"),
    item("9.6", "メールアドレス再入力", ONLINE_SYSTEM_EMAIL, "text", "9.5 と同じ"),
    item("10.1", "旅券 (1)番号", (w.passport_no ?? "").normalize("NFKC").toUpperCase(), "upper", "半角英数字12文字以内", wk("passport_no"), w.passport_no ?? ""),
    item("10.2", "旅券 (2)有効期限", ymdCompact(w.passport_expiry_date) ?? "", "date8", undefined, wkDate("passport_expiry_date"), w.passport_expiry_date ?? ""),
    item("11", "入国目的", ssw2 ? "Ｖ「特定技能（2号）」" : "Ｖ「特定技能（1号）」", "choice", "プルダウンから選ぶ（希望する在留資格から）"),
    item(
      "12",
      "入国予定年月日",
      es ? toZenkaku(formatYmdJa(es)) : "",
      "text",
      es ? "雇用開始日（支援計画書の日付）を入れています。入国の予定日が違えば直す。40文字以内" : "40文字以内（例 ２０２０年４月１日）。雇用開始日を入れると自動で出ます",
    ),
    item("13.1", "上陸予定港", NINTEI_PORT_OF_ENTRY, "choice", "プルダウンから選ぶ（いつもは福岡空港。違う空港から入国するときは選び直す）"),
    item("14.1", "滞在予定期間(年数)", String(eeYears), "choice", `雇用契約期間（${eeYears}年）から`),
    item("14.2", "滞在予定期間(月数)", "0", "choice", "雇用契約期間から"),
    item("15", "同伴者の有無", "無", "choice", "家族と一緒に入国しないので「無」。一緒に入国するなら「有」"),
    visaPlace
      ? item("16", "査証申請予定地", visaPlace, "text", "ビザを申請する日本の大使館がある都市（国籍から）。ホーチミンの総領事館で申請するときは直す。40文字以内")
      : manual("16", "査証申請予定地", "ビザを申請する日本の大使館・総領事館がある都市（例: MANILA - PHILIPPINES）。40文字以内"),
    stayedInJapan
      ? item("17.1", "過去の出入国歴 有無", "有", "choice", "職歴に日本での在留（技能実習など）があるので「有」。17.2 回数・17.3〜17.4 直近の出入国歴（始期・終期）はパスポートの出入国印を見て画面で入れる")
      : choose("17.1", "過去の出入国歴 有無", "無", "日本に来たことがあれば「有」にして 17.2 回数・17.3〜17.4 直近の出入国歴（始期・終期）を入れる"),
    choose("18.1", "過去の在留資格認定証明書交付申請歴 有無", undefined, "前に認定証明書を申請したことがあれば（技能実習で来日したときなど）「有」にして 18.2 回数・18.3 うち不交付となった回数を選ぶ"),
    item("19", "犯罪を理由とする処分を受けたことの有無", w.criminal_record || "無", "choice", w.criminal_record ? "日本国外・交通違反等を含む" : "未登録なので「無」としています（日本国外・交通違反等を含む）。有なら鉛筆マークから選んで保存", wk("criminal_record", YES_NO), w.criminal_record ?? ""),
    ...(w.criminal_record === "有"
      ? [item("19", "処分の内容", w.criminal_record_note ?? "", "text", "具体的な内容。40文字以内", wk("criminal_record_note"))]
      : []),
    choose("20.1", "退去強制又は出国命令による出国の有無", "無", "「有」なら 20.2 回数・20.3 直近の送還歴（出国日）を入れる"),
    item(
      "21.1",
      "在日親族及び同居者 有無",
      w.relatives_in_japan ?? "",
      "choice",
      "外国人詳細 ＞ 在日親族の同居。日本にいる家族（夫・妻など）がいれば「有」にして 21.2〜21.8 を人数分入れる（＋追加する。親族の氏名などは外国人詳細で登録）。勤務先には「○○で特定技能1号審査中」のようにも書ける",
      wk("relatives_in_japan", YES_NO),
    ),
    ...relativeItems(w.relatives_in_japan === "有" ? (w.relatives ?? []) : [], true),
  ];
}

function ninteiKubunV(
  input: ApplicationCopyInput,
  groups: CopyGroup[],
  careers: WorkHistory[],
  totalY: string,
  totalM: string,
  totalAsOf: string | undefined,
): OnlineItem[] {
  const w = input.worker;
  return [
    item(
      "23.1",
      "技能水準 評価区分",
      w.skill_eval_kind ||
        (val(groups, "18 技能水準 (1)試験名") ? "特定技能評価試験" : val(groups, "18 専門級の合格名（技能実習）") ? "技能実習２号を良好に修了" : ""),
      "choice",
      w.skill_eval_kind ? "登録した区分。これにより 23.2〜23.8 の項目が変わる" : "未登録なので合格証・専門級から推定。鉛筆マークから選んで保存できる",
      wk("skill_eval_kind", SKILL_EVAL_KINDS),
      w.skill_eval_kind ?? "",
    ),
    linked(groups, "23", "技能水準 試験名", "18 技能水準 (1)試験名", "text"),
    linked(groups, "23", "技能水準 受験地", "18 (2)受験地", "text"),
    item(
      "24.1",
      "日本語能力 評価区分",
      w.japanese_eval_kind || (val(groups, "19.2 日本語能力 合格した試験名") ? "特定技能評価試験" : ""),
      "choice",
      w.japanese_eval_kind
        ? "登録した区分（特定技能1号で入国を希望するとき）。これにより 24.2〜24.8 の項目が変わる"
        : "特定技能1号で入国を希望するとき。未登録なので日本語の合格証から推定。鉛筆マークから選んで保存できる",
      wk("japanese_eval_kind", SKILL_EVAL_KINDS),
      w.japanese_eval_kind ?? "",
    ),
    linked(groups, "24", "日本語能力 試験名", "19.2 日本語能力 合格した試験名", "text"),
    linked(groups, "24", "日本語能力 受験地", "19 (2)受験地", "text"),
    item("24", "日本語能力 レベル", val(groups, "19 レベル"), "choice", undefined, wk("cert_nihongo_level", JLPT_LEVELS)),
    linked(groups, "25", "良好に修了した技能実習2号 職種", "20 技能実習2号良好修了 (1)職種名", "text", "23・24 で「技能実習2号を良好に修了」を選んだ人だけ（例: 耕種農業）"),
    linked(groups, "25", "良好に修了した技能実習2号 作業", "20 (2)作業名", "text", "例: 施設園芸"),
    linked(groups, "25", "良好に修了したことの証明", "20 (3)良好修了の証明方法", "choice", "3級の技能検定（技能実習評価試験の実技試験）に合格していればそれを選ぶ"),
    item("26.1", "申請時における特定技能1号での通算在留期間(年数)", totalY, "choice", ["過去の在留歴を含む。特定技能1号で入国を希望するとき", totalAsOf].filter(Boolean).join("。")),
    item("26.2", "申請時における特定技能1号での通算在留期間(月数)", totalM, "choice", totalAsOf),
    item("27.1", "保証金の徴収・財産管理・違約金等の支払契約の有無", "無", "choice", "必ず「無」"),
    item("28.1", "取次ぎ又は活動準備に関する外国の機関への費用支払について合意していることの有無", NEITHER, "choice", "有・無のどちらも選ばない（費用の支払があるときは「有」にして 28.2 外国の機関名・28.3 支払額を入れる）"),
    item("29", "国籍国等において定められる本邦で行う活動に関連して遵守すべき手続を経ていることの有無", NEITHER, "choice", "有・無のどちらも選ばない"),
    item("30", "本邦において定期的に負担する費用について合意していることの有無", "有", "choice", "必ず「有」"),
    item("31", "技能実習で修得した技能等の本国への移転に努めることの有無", transferChoice(input.desiredStatus), "choice", "特定技能2号を希望するときだけ「有」。それ以外はどちらも選ばない"),
    item(
      "32",
      "特定産業分野に特有の基準に適合していることの有無",
      fieldSpecificChoice(val(groups, "2 (2)特定産業分野")),
      "choice",
      "介護・ビルクリーニング・工業製品製造業・建設・造船・舶用工業・自動車整備・航空・宿泊・自動車運送業・飲食料品製造業・外食業・林業・木材産業は「有」。それ以外はどちらも選ばない",
    ),
    item("", "職歴の有無", careers.length > 0 ? "有" : "無", "choice", "外国のものを含む"),
    ...careers.flatMap((h, i) => {
      const n = String(i + 1).padStart(2, "0");
      return [
        item(`33.1`, `職歴 入社 年月${n}`, ym6(h.start), "ym6", "6桁（例 200101）"),
        item(`33.2`, `職歴 退社 年月${n}`, h.end ? ym6(h.end) : "", "ym6", h.end ? undefined : "在職中は空欄"),
        item(`33.3`, `職歴 勤務先 名称${n}`, h.org, "text", "60文字以内"),
      ];
    }),
    skip("34.1〜34.6", "申請人、法定代理人、法第7条の2第2項に規定する代理人", "取次申請なので何も記載しない（本人・代理人が自分で申請するときだけ入れる）"),
  ];
}

// 1つの欄をまとめてコピーする文（手入力の項目は案内だけ）
export function onlineSectionText(section: OnlineSection): string {
  return section.items
    .map((i) => `${i.no ? `${i.no} ` : ""}${i.label}: ${i.value || (i.skip ? "（記載しない）" : i.manual ? "（画面で入力）" : "未登録")}`)
    .join("\n");
}

export const ONLINE_FORMAT_LABELS: Record<OnlineFormat, string> = {
  text: "",
  upper: "半角大文字",
  zenkaku: "全角",
  date8: "8桁",
  ym6: "6桁",
  digits: "数字のみ",
  choice: "選択",
};
