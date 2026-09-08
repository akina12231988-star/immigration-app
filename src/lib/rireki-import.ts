// 履歴書ツール（tokutei-rireki）で作った履歴書PDFの取り込み。
//
// ツールは履歴書PDFの末尾に、入力内容をJSON（Base64）で
//   @@RIREKI_JSON_V1@@ … @@END@@
// の形で不可視の文字として埋め込んでいる。PDFの文字を読み取ってこの部分を取り出し、
// 外国人の登録内容（氏名・生年月日・在留資格・住所・職歴など）に変換する。
// 埋め込みの仕様はツール側 index.html の buildPayload と対になっている。

import type { WorkHistoryInput, WorkerInput } from "@/types/db";
import type { VisaType } from "@/types/ssw";
import { normalizeApplyName } from "@/lib/ssw-apply-check";

// ---- 埋め込みデータの形（ツール側 buildPayload と同じ） ----

export interface RirekiCareer {
  startYear: string;
  startMonth: string;
  startDay: string;
  endYear: string;
  endMonth: string;
  endDay: string;
  company: string;
  sswFieldKey: string;
  sswField: string; // 特定技能分野（日本語）
  residenceStatusKey: string;
  residenceStatus: string; // 当時の在留資格（日本語）
}

export interface RirekiFamily {
  relation: string;
  name: string;
  birthYear: string;
  job: string;
}

export interface RirekiPayload {
  docType: string; // 'resume'
  schema: string; // 'tokutei-rireki'
  version: number;
  generatedAt: string;
  sourceLang: string; // ja / vi / id / km / tl / en
  basic: {
    name: string;
    kana: string;
    gender: string; // 男性 / 女性
    birth: string; // YYYY-MM-DD
    nationality: string;
    languages: string;
    spouse: string; // 有 / 無
    trainingType: string;
    trainingTypeKey: string;
    trainingWork: string;
    trainingWorkKey: string;
    trainingEnd: string;
    visaExpiry: string; // YYYY-MM-DD
    residenceStatus: string; // 現在の在留資格（日本語）
    residenceStatusKey: string;
    addressJapan: string;
    addressHome: string;
    qualifications: string;
    height: string;
    weight: string;
    bloodType: string;
    illness: string;
    vision: string;
    dominantHand: string;
    hobby: string;
    drinking: string;
    smoking: string;
  };
  careers: RirekiCareer[];
  families: RirekiFamily[];
}

const MARKER_RE = /@@RIREKI_JSON_V1@@([A-Za-z0-9+/=]+)@@END@@/;

// Base64（UTF-8）を文字に戻す。ブラウザでもサーバーでも動くようにする
function decodeBase64Utf8(b64: string): string {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// PDFから読み取った文字（全ページぶん）から埋め込みデータを取り出す。
// 文字は行や文字の切れ目で空白が入るため、空白を全部取り除いてから探す。
// 見つからない・壊れているときは null
export function extractRirekiPayload(text: string): RirekiPayload | null {
  const flat = (text ?? "").replace(/[\s　]+/g, "");
  const m = MARKER_RE.exec(flat);
  if (!m) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(decodeBase64Utf8(m[1]));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema !== "tokutei-rireki" || o.docType !== "resume") return null;
  const basic = (o.basic && typeof o.basic === "object" ? o.basic : {}) as Record<string, unknown>;
  const careers = Array.isArray(o.careers) ? (o.careers as Record<string, unknown>[]) : [];
  const families = Array.isArray(o.families) ? (o.families as Record<string, unknown>[]) : [];
  const b = (k: string) => str(basic[k]);
  return {
    docType: "resume",
    schema: "tokutei-rireki",
    version: typeof o.version === "number" ? o.version : 1,
    generatedAt: str(o.generatedAt),
    sourceLang: str(o.sourceLang),
    basic: {
      name: b("name"),
      kana: b("kana"),
      gender: b("gender"),
      birth: b("birth"),
      nationality: b("nationality"),
      languages: b("languages"),
      spouse: b("spouse"),
      trainingType: b("trainingType"),
      trainingTypeKey: b("trainingTypeKey"),
      trainingWork: b("trainingWork"),
      trainingWorkKey: b("trainingWorkKey"),
      trainingEnd: b("trainingEnd"),
      visaExpiry: b("visaExpiry"),
      residenceStatus: b("residenceStatus"),
      residenceStatusKey: b("residenceStatusKey"),
      addressJapan: b("addressJapan"),
      addressHome: b("addressHome"),
      qualifications: b("qualifications"),
      height: b("height"),
      weight: b("weight"),
      bloodType: b("bloodType"),
      illness: b("illness"),
      vision: b("vision"),
      dominantHand: b("dominantHand"),
      hobby: b("hobby"),
      drinking: b("drinking"),
      smoking: b("smoking"),
    },
    careers: careers.map((c) => ({
      startYear: str(c.startYear),
      startMonth: str(c.startMonth),
      startDay: str(c.startDay),
      endYear: str(c.endYear),
      endMonth: str(c.endMonth),
      endDay: str(c.endDay),
      company: str(c.company),
      sswFieldKey: str(c.sswFieldKey),
      sswField: str(c.sswField),
      residenceStatusKey: str(c.residenceStatusKey),
      residenceStatus: str(c.residenceStatus),
    })),
    families: families.map((f) => ({
      relation: str(f.relation),
      name: str(f.name),
      birthYear: str(f.birthYear),
      job: str(f.job),
    })),
  };
}

// ---- 外国人の登録内容への変換 ----

// 日付（YYYY-MM-DD だけ受け付ける。それ以外は null）
function isoDate(s: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// ツールの性別（男性／女性）→ 外国人詳細の性別（男／女）
export function rirekiGender(s: string): string {
  const t = (s ?? "").trim();
  if (t.startsWith("男")) return "男";
  if (t.startsWith("女")) return "女";
  return "";
}

// ツールの「現在の在留資格」（日本語）→ 外国人詳細の在留資格。
// 選択肢にある表記はその表記にそろえ、無いもの（留学・家族滞在など）はそのまま入れる
const CURRENT_STATUS_MAP: Record<string, string> = {
  特定技能1号: "特定技能1号",
  特定技能2号: "特定技能2号",
  技能実習1号: "技能実習1号",
  技能実習2号: "技能実習2号",
  技能実習3号: "技能実習3号",
  "特定活動（特定技能1号移行準備）": "特定活動（特定技能1号以降準備）",
};

export function rirekiResidenceStatus(s: string): string {
  // 全角数字は半角に、括弧は全角にそろえる（NFKC は括弧も半角にしてしまうので戻す）
  const t = (s ?? "").normalize("NFKC").replace(/\(/g, "（").replace(/\)/g, "）").trim();
  if (!t || t === "その他") return "";
  return CURRENT_STATUS_MAP[t] ?? t;
}

// 履歴書の内容から、外国人の登録内容（空でない項目だけ）を作る
export function rirekiToWorkerPatch(p: RirekiPayload): Partial<WorkerInput> {
  const b = p.basic;
  const patch: Partial<WorkerInput> = {};
  if (b.name) patch.name = b.name;
  if (b.kana) patch.kana = b.kana;
  const gender = rirekiGender(b.gender);
  if (gender) patch.gender = gender;
  const birth = isoDate(b.birth);
  if (birth) patch.birth = birth;
  if (b.nationality) patch.nationality = b.nationality;
  const status = rirekiResidenceStatus(b.residenceStatus);
  if (status) patch.residence_status = status;
  const expiry = isoDate(b.visaExpiry);
  if (expiry) patch.residence_expiry_date = expiry;
  if (b.addressJapan) patch.address = b.addressJapan;
  if (b.addressHome) patch.home_address = b.addressHome;
  if (b.spouse === "有" || b.spouse === "無") patch.has_spouse = b.spouse;
  return patch;
}

// 職歴の「当時の在留資格」（日本語）→ 職歴の在留資格の区分。
// 在留資格が無い職歴は本国での職歴とみなす
export function rirekiVisaType(residenceStatus: string): VisaType {
  const t = (residenceStatus ?? "").normalize("NFKC").replace(/\(/g, "（").replace(/\)/g, "）").trim();
  if (!t) return "本国での職歴";
  if (t.startsWith("技能実習")) return "技能実習";
  if (t.startsWith("特定技能2号")) return "特定技能2号";
  if (t.startsWith("特定技能1号")) return "特定技能1号";
  if (t.includes("特定技能1号")) return "特定活動（特定技能1号移行準備）";
  if (t.includes("特定技能2号")) return "特定活動（特定技能2号移行準備）";
  if (t === "留学") return "留学";
  return "その他";
}

// 年・月・日から日付。月が無ければ1月、日が無ければ1日
function careerDate(y: string, m: string, d: string): string | null {
  const yy = Number(y);
  if (!Number.isInteger(yy) || yy < 1900 || yy > 2100) return null;
  const mm = Math.min(Math.max(Number(m) || 1, 1), 12);
  const dd = Math.min(Math.max(Number(d) || 1, 1), 31);
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export type RirekiWorkHistory = Omit<WorkHistoryInput, "worker_id">;

// 履歴書の職歴 → 職歴の行。開始年が無い行は取り込まない
export function rirekiToWorkHistories(p: RirekiPayload): RirekiWorkHistory[] {
  const rows: RirekiWorkHistory[] = [];
  for (const c of p.careers) {
    const start = careerDate(c.startYear, c.startMonth, c.startDay);
    if (!start) continue;
    rows.push({
      visa: rirekiVisaType(c.residenceStatus),
      start_date: start,
      end_date: careerDate(c.endYear, c.endMonth, c.endDay),
      org_name: c.company,
      prefecture: "",
      role: c.sswField,
      note: "履歴書PDFから取り込み",
      kept_residence_status: false,
    });
  }
  return rows;
}

// ---- 登録済みの外国人との突き合わせ ----

export interface RirekiMatchCandidate {
  id: string;
  name: string;
  kana?: string | null;
  birth?: string | null;
  nationality?: string | null;
}

export interface RirekiMatch<T extends RirekiMatchCandidate> {
  worker: T;
  sameBirth: boolean; // 生年月日も一致
}

// 氏名（空白・大文字小文字の違いは無視）が同じ人。生年月日も一致する人を先に
export function findRirekiMatches<T extends RirekiMatchCandidate>(
  p: RirekiPayload,
  workers: T[],
): RirekiMatch<T>[] {
  const key = normalizeApplyName(p.basic.name);
  if (!key) return [];
  const birth = isoDate(p.basic.birth);
  return workers
    .filter((w) => normalizeApplyName(w.name) === key)
    .map((w) => ({ worker: w, sameBirth: !!birth && w.birth === birth }))
    .sort((a, b) => Number(b.sameBirth) - Number(a.sameBirth));
}

// 取り込み内容の一覧（画面の確認表示用）。値が空の項目は出さない
export function rirekiPreviewRows(p: RirekiPayload): { label: string; value: string }[] {
  const b = p.basic;
  const rows: [string, string][] = [
    ["氏名", b.name],
    ["フリガナ", b.kana],
    ["性別", rirekiGender(b.gender)],
    ["生年月日", b.birth],
    ["国籍", b.nationality],
    ["現在の在留資格", rirekiResidenceStatus(b.residenceStatus) || b.residenceStatus],
    ["在留期限", b.visaExpiry],
    ["日本の住所", b.addressJapan],
    ["本国の住所", b.addressHome],
    ["配偶者", b.spouse],
    ["理解できる言語", b.languages],
    ["実習の職種", b.trainingType],
    ["実習の作業", b.trainingWork],
    ["資格・免許", b.qualifications],
  ];
  return rows.filter(([, v]) => v).map(([label, value]) => ({ label, value }));
}
