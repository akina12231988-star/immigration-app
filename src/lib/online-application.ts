import type { ApplicationCopyInput, CopyEdit, CopyGroup, CopyItem } from "@/lib/application-copy";
import { cu, industryFieldName, it, og, ONLINE_INDUSTRY_FIELDS, SKILL_EVAL_KINDS, wk, wkDate, YES_NO, ymdCompact } from "@/lib/application-copy";
import { JLPT_LEVELS } from "@/lib/cert-exam";
import { ONLINE_MAIN_OCCUPATIONS } from "@/lib/online-main-occupations";
import { ONLINE_MAIN_INDUSTRIES, suggestedMainIndustry } from "@/lib/online-main-industries";
import { suggestedMainOccupation } from "@/lib/online-main-occupations";
import { CUSTODIAN_INFO, type CustodianInfo } from "@/lib/custody";
import { effectiveResidencePeriod } from "@/lib/residence-card";
import { contractPeriodEnd, formatYmdJa } from "@/lib/support-plan-dates";

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
// 窓口で受け取るときの受領官署
export const CARD_RECEIPT_OFFICE = "福岡出入国在留管理局 熊本出張所";

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

// 16.2〜16.8 同居している在日親族（人数分）。続柄・国籍はアプリに無いので画面で入れる
export function relativeItems(relatives: { name: string; birth: string; workplace: string; residence_card_no: string }[]): OnlineItem[] {
  return relatives.flatMap((r, i) => {
    const nth = relatives.length > 1 ? `（${i + 1}人目）` : "";
    return [
      manual(`16.2`, `続柄${nth}`, "プルダウンから選ぶ（夫・妻・子 など）"),
      item(`16.3`, `氏名${nth}`, upperName(r.name), "upper", "旅券のとおり。半角大文字"),
      item(`16.4`, `生年月日${nth}`, ymdCompact(r.birth) ?? "", "date8"),
      manual(`16.5`, `国籍・地域${nth}`, "プルダウンから選ぶ"),
      item(`16.6`, `同居の有無${nth}`, "有", "choice", "外国人詳細に登録しているのは同居している親族"),
      item(`16.7`, `勤務先・通学先${nth}`, toZenkaku(r.workplace), "zenkaku"),
      item(`16.8`, `在留カード番号${nth}`, (r.residence_card_no ?? "").normalize("NFKC").toUpperCase().replace(/\s+/g, ""), "upper"),
    ];
  });
}

export function buildOnlineApplication(input: ApplicationCopyInput, groups: CopyGroup[]): OnlineSection[] {
  const { worker: w, org, intake, histories, planDates } = input;
  const c: CustodianInfo = input.custodian ?? { ...CUSTODIAN_INFO };
  const es = planDates.es || w.employment_start_on || "";
  const ee = es ? contractPeriodEnd(es) : "";
  const period = effectiveResidencePeriod(w);
  const total = find(groups, "21 申請時における特定技能1号での通算在留期間");
  const [totalY, totalM] = total?.parts ?? ["", ""];
  const careers = [...histories].sort((a, b) => (a.start < b.start ? -1 : 1));

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
    item("13.2", "希望する在留期間", residencePeriodChoice(period), "choice", "更新は通常いまと同じ期間。審査で変わることがある"),
    renewalReasonText(input.desiredStatus)
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
      w.japanese_eval_kind || (val(groups, "19 日本語能力 (1)試験名") ? "特定技能評価試験" : ""),
      "choice",
      w.japanese_eval_kind
        ? "登録した区分（特定技能1号のとき）。これにより 19.2〜 の項目が変わる"
        : "特定技能1号のとき。未登録なので日本語の合格証から推定。鉛筆マークから選んで保存できる",
      wk("japanese_eval_kind", SKILL_EVAL_KINDS),
      w.japanese_eval_kind ?? "",
    ),
    linked(groups, "19", "日本語能力 試験名", "19 日本語能力 (1)試験名", "text"),
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

  const agent: OnlineItem[] = [
    item(
      "",
      "取次者(オンラインシステム利用者) (1)氏名",
      toZenkaku(input.agentName?.trim() || c.agentName),
      "zenkaku",
      input.agentName?.trim()
        ? "申請準備の申請取次士（全角26文字以内）"
        : "申請準備の申請取次士が未定なので登録支援機関の申請取次者（全角26文字以内）。申請準備で申請取次士を選ぶとその人になる",
    ),
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
  // 取次機関（2.38〜2.42）は認定申請のときだけ。外国人ごとに入力・保存する
  const isNintei = (input.appType ?? "").includes("認定");
  const agencyItems: OnlineItem[] = [
    item("2.38", "(14)取次機関 氏名又は名称", toZenkaku(w.agency_name), "zenkaku", isNintei ? "国外の取次機関（送出機関など）。全角60文字以内" : "認定申請のときだけ入れる", wk("agency_name"), w.agency_name ?? ""),
    item("2.39", "(14)取次機関 法人番号", digitsOnly(w.agency_corporate_no), "digits", "無ければ「無」を選んで空欄", wk("agency_corporate_no"), w.agency_corporate_no ?? ""),
    item("2.40", "(14)取次機関 郵便番号", digitsOnly(w.agency_postal), "digits", "ハイフン無し", wk("agency_postal"), w.agency_postal ?? ""),
    item("2.41", "(14)取次機関 住所", toZenkaku(w.agency_address), "zenkaku", "全角85文字以内", wk("agency_address"), w.agency_address ?? ""),
    item("2.42", "(14)取次機関 電話番号", digitsOnly(w.agency_tel), "digits", "ハイフン無し", wk("agency_tel"), w.agency_tel ?? ""),
  ];

  const contract: OnlineItem[] = [
    item("2.1", "特定技能雇用契約 (1)雇用契約期間(始期)", ymdCompact(es) ?? "", "date8", "雇用開始日（支援計画書の日付か外国人の雇用開始日）", wkDate("employment_start_on"), w.employment_start_on ?? ""),
    item("2.2", "特定技能雇用契約 (1)雇用契約期間(終期)", ymdCompact(ee) ?? "", "date8", "始期から2年間（2年後の前日）"),
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
    item("3.19", "(10)労災保険・雇用保険の適用事業所であることの有無", val(groups, "労災保険及び雇用保険の適用事業所"), "choice", "所属機関の労災・雇用保険の登録から"),
    item("3.20", "(10)労働保険番号", (intake?.rosai_no ?? "").normalize("NFKC").replace(/[^0-9A-Za-z]/g, ""), "digits", "半角英数字18文字以内・ハイフン無しでコピー（登録はハイフンありでよい）。「有」のときだけ", org ? it("rosai_no") : undefined, intake?.rosai_no ?? ""),
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
      "特定技能1号での在留を希望し登録支援機関に支援計画の全部の実施を委託することの有無",
      isSsw1 ? "委託する" : NEITHER,
      "choice",
      isSsw1 ? "特定技能1号なので「委託する」。3.44〜3.57（自社支援の体制）は入力不要で、4.1〜4.16 と 5.1〜5.16 を入れる" : "特定技能1号のときだけ「委託する」",
    ),
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

  // 在留カードの受領方法（郵送／窓口）はこの場で選んで保存する。窓口なら受領官署に熊本出張所を出す
  const receiptMethod = (w.card_receipt_method ?? "").trim();
  const receiptOffice: OnlineItem =
    receiptMethod === "窓口"
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
    item(
      "",
      "在留カードの受領方法",
      receiptMethod,
      "choice",
      "ここで郵送か窓口を選んで保存できます（通常は「郵送」。再入国許可申請を同時に申請するときは「窓口」）",
      wk("card_receipt_method", CARD_RECEIPT_METHODS),
    ),
    item("", "申請対象者の住居地（都道府県）", prefectureOf(w.address), "choice", "プルダウンから選ぶ"),
    receiptOffice,
    item("", "通知送信用メールアドレス", ONLINE_SYSTEM_EMAIL, "text", "オンラインシステムの利用者（取次者）のメールアドレス。再入力欄にも同じものを入れる"),
    choose("", "申請の意思の確認・申請内容の確認", "チェック", "2つのチェックを入れる"),
    item("", "フリー欄（協力確認書）", councilFreeText(intake?.council_office_submissions, intake?.council_residence_submissions), "text", "現在「特定技能」の人は協力確認書の有無を書く。300文字以内"),
    manual("", "顔写真", "JPEG を添付（3か月以内に撮影）"),
  ];

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
