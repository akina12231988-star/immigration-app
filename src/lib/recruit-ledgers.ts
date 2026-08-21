// 職業紹介事業の法定帳簿（厚労省様式）のExcel出力。
//
// 労働局の訪問指導（監査）では 求人管理簿・求職管理簿・手数料管理簿 の写しと、
// 事前提出の様式30（求人者リスト）を求められる。毎回手作業で作らなくて済むよう、
// 求人一覧・求職一覧・紹介手数料台帳のデータから様式の項目を網羅した一覧を組み立てる。
// （公式様式は結合セルの多い枠だが、記載項目が揃っていることが要件のため
//   1行1件のフラットな表として出力する）

import type { CellValue, SheetSpec } from "@/lib/xlsx-export";

// 採用日から2年間が転職勧奨の禁止期間（無期雇用就職者のみ記載）。
// 例: 2024-04-15 採用 → 2026-04-14 まで
export function noPoachingUntil(hiredOn: string): string {
  const m = hiredOn.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]) + 2, Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 6か月以内の離職状況（無期雇用就職者に関する事項）を1マスの文にする
export function separationSummary(app: {
  separation_status?: string;
  separation_checked_on?: string | null;
  separation_check_method?: string;
}): string {
  const status = app.separation_status ?? "";
  if (!status) return "";
  const parts: string[] = [];
  if (app.separation_checked_on) parts.push(`調査日 ${app.separation_checked_on}`);
  if (app.separation_check_method) parts.push(app.separation_check_method);
  return parts.length > 0 ? `${status}（${parts.join("・")}）` : status;
}

// 無期雇用就職者に関する事項は「無期」のときだけ記載する
function indefiniteOnly(employmentTerm: string, value: string): string {
  return employmentTerm === "無期" ? value : "";
}

// ---- 求人管理簿 ----

export interface PostingLedgerApp {
  applied_on: string; // 紹介年月日
  worker_name: string; // 求職者氏名
  result: string; // 採否結果
  result_on: string | null; // 採用年月日（採用のとき）
  employment_term?: string;
  separation_status?: string;
  separation_checked_on?: string | null;
  separation_check_method?: string;
}

export interface PostingLedgerEntry {
  id: string; // 求人（job_postings.id）。様式30で選ぶときの目印に使う
  organization_id: string | null; // 手数料管理簿の入金状況と突き合わせる
  acceptance_no: string;
  org_name: string; // 求人者の氏名又は名称
  org_address: string; // 所在地
  contact: string; // 連絡担当者・連絡先電話番号
  received_on: string; // 受付年月日
  valid_until: string; // 有効期間
  openings: number | null; // 求人数
  job_type: string; // 職種
  work_location: string; // 就業場所
  employment_period: string; // 雇用期間
  wage: string; // 賃金
  note: string; // 備考
  applications: PostingLedgerApp[];
}

const POSTING_HEADER = [
  "求人受理番号",
  "求人者の氏名又は名称",
  "所在地",
  "連絡担当者・電話番号",
  "受付年月日",
  "有効期間",
  "求人数",
  "職種",
  "就業場所",
  "雇用期間",
  "賃金",
  "紹介年月日",
  "求職者氏名",
  "採否結果",
  "採用年月日",
  "雇用期間（無期・有期）",
  "転職勧奨禁止期間",
  "6か月以内の離職状況",
  "備考",
];

export function buildPostingLedgerSheet(entries: PostingLedgerEntry[]): SheetSpec {
  const rows: CellValue[][] = [
    ["求人管理簿", ...Array(POSTING_HEADER.length - 2).fill(null), "[有効期間の終了後２年間保存]"],
    POSTING_HEADER,
  ];
  for (const p of entries) {
    const base: CellValue[] = [
      p.acceptance_no,
      p.org_name,
      p.org_address,
      p.contact,
      p.received_on,
      p.valid_until,
      p.openings,
      p.job_type,
      p.work_location,
      p.employment_period,
      p.wage,
    ];
    // 紹介実績が無い求人も1行出す（取扱状況は空欄）
    if (p.applications.length === 0) {
      rows.push([...base, "", "", "", "", "", "", "", p.note]);
      continue;
    }
    for (const a of p.applications) {
      const hiredOn = a.result === "採用" ? (a.result_on ?? "") : "";
      const term = a.employment_term ?? "";
      rows.push([
        ...base,
        a.applied_on,
        a.worker_name,
        a.result,
        hiredOn,
        term,
        indefiniteOnly(term, hiredOn ? noPoachingUntil(hiredOn) : ""),
        indefiniteOnly(term, separationSummary(a)),
        p.note,
      ]);
    }
  }
  return {
    name: "求人管理簿",
    rows,
    headerRows: 2,
    columnWidths: [12, 24, 28, 22, 12, 12, 7, 14, 22, 14, 14, 12, 18, 9, 12, 10, 14, 30, 20],
  };
}

// ---- 求職管理簿 ----

export interface SeekerLedgerApp {
  applied_on: string; // 紹介年月日
  acceptance_no: string; // 求人受理番号
  employer_name: string; // 求人者の氏名又は名称
  result: string;
  result_on: string | null;
  employment_term?: string;
  separation_status?: string;
  separation_checked_on?: string | null;
  separation_check_method?: string;
}

export interface SeekerLedgerEntry {
  jobseeker_no: string; // 求職受付番号
  name: string; // 求職者の氏名
  address: string; // 住所
  birth: string; // 生年月日
  desired_job_type: string; // 希望職種
  accepted_on: string; // 受付年月日
  valid_until: string; // 有効期間
  note: string; // 備考
  applications: SeekerLedgerApp[];
}

const SEEKER_HEADER = [
  "求職受付番号",
  "求職者の氏名",
  "住所",
  "生年月日",
  "希望職種",
  "受付年月日",
  "有効期間",
  "紹介年月日",
  "求人受理番号",
  "求人者の氏名又は名称",
  "採否結果",
  "採用年月日",
  "雇用期間（無期・有期）",
  "転職勧奨禁止期間",
  "6か月以内の離職状況",
  "備考",
];

export function buildSeekerLedgerSheet(entries: SeekerLedgerEntry[]): SheetSpec {
  const rows: CellValue[][] = [
    ["求職管理簿", ...Array(SEEKER_HEADER.length - 2).fill(null), "[有効期間の終了後２年間保存]"],
    SEEKER_HEADER,
  ];
  for (const s of entries) {
    const base: CellValue[] = [
      s.jobseeker_no,
      s.name,
      s.address,
      s.birth,
      s.desired_job_type,
      s.accepted_on,
      s.valid_until,
    ];
    if (s.applications.length === 0) {
      rows.push([...base, "", "", "", "", "", "", "", "", s.note]);
      continue;
    }
    for (const a of s.applications) {
      const hiredOn = a.result === "採用" ? (a.result_on ?? "") : "";
      const term = a.employment_term ?? "";
      rows.push([
        ...base,
        a.applied_on,
        a.acceptance_no,
        a.employer_name,
        a.result,
        hiredOn,
        term,
        indefiniteOnly(term, hiredOn ? noPoachingUntil(hiredOn) : ""),
        indefiniteOnly(term, separationSummary(a)),
        s.note,
      ]);
    }
  }
  return {
    name: "求職管理簿",
    rows,
    headerRows: 2,
    columnWidths: [12, 20, 30, 12, 14, 12, 12, 12, 12, 24, 9, 12, 10, 14, 30, 20],
  };
}

// ---- 手数料管理簿 ----

export interface FeeLedgerEntry {
  payer_name: string; // 手数料を支払う者の氏名又は名称
  paid_on: string | null; // 徴収年月日（未徴収は空欄）
  fee_kind: string; // 手数料の種類
  fee: number; // 手数料の額（円）
  calc_basis: string; // 算出根拠（賃金、割合等）
  worker_name: string; // 誰の分か（算出根拠の補足に使う）
  note: string;
}

const FEE_HEADER = [
  "手数料を支払う者の氏名又は名称",
  "徴収年月日",
  "手数料の種類",
  "手数料の額（円）",
  "第二種特別加入保険料",
  "手数料の算出根拠（賃金、割合等）",
  "備考",
];

export function buildFeeLedgerSheet(entries: FeeLedgerEntry[]): SheetSpec {
  const rows: CellValue[][] = [
    ["手数料管理簿", ...Array(FEE_HEADER.length - 2).fill(null), "[手数料の徴収完了後２年間保存]"],
    FEE_HEADER,
  ];
  for (const f of entries) {
    // 算出根拠が未入力でも、誰の分の紹介手数料かは分かるようにする
    const basis = f.calc_basis || (f.worker_name ? `${f.fee_kind}（${f.worker_name} 分）` : "");
    const note = [f.note, f.paid_on ? "" : "未徴収"].filter(Boolean).join("・");
    rows.push([f.payer_name, f.paid_on ?? "", f.fee_kind, f.fee, "", basis, note]);
  }
  return {
    name: "手数料管理簿",
    rows,
    headerRows: 2,
    columnWidths: [28, 12, 16, 14, 14, 40, 20],
  };
}

// ---- 様式30 求人者リスト（訪問指導の事前提出） ----

// 求人管理簿の元データを様式30の1行分へ変換する
export function postingEntriesToForm30(entries: PostingLedgerEntry[]): Form30Posting[] {
  return entries.map((p) => ({
    id: p.id,
    organization_id: p.organization_id,
    received_on: p.received_on,
    org_name: p.org_name,
    org_address: p.org_address,
    job_type: p.job_type,
    note: p.note,
    referred_dates: p.applications.map((a) => a.applied_on),
  }));
}

export interface Form30Posting {
  id: string; // 求人（job_postings.id）
  organization_id: string | null; // 求人者（手数料管理簿の入金状況の突き合わせに使う）
  received_on: string; // 求人受付年月日
  org_name: string; // 求人事業所名又は求人者氏名
  org_address: string; // 所在地
  job_type: string; // 求人職種
  note: string; // 備考
  referred_dates: string[]; // 紹介年月日（応募日）の一覧
}

// 基準日（訪問予定日）から過去1年間に紹介実績のある求人の直近15件。
// 実績が無い場合は「実績なし」と書いて提出する運用のため、0件でも行を出す
export function buildForm30Sheet(postings: Form30Posting[], baseDate: string): SheetSpec {
  const m = baseDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const from = m ? `${Number(m[1]) - 1}-${m[2]}-${m[3]}` : baseDate;
  const withResults = postings
    .filter((p) => p.referred_dates.some((d) => d >= from && d <= baseDate))
    .sort((a, b) => (a.received_on > b.received_on ? -1 : 1))
    .slice(0, 15);

  const rows: CellValue[][] = [
    [`■求人者リスト（${baseDate} から過去１年間の実績）`, null, null, null, null, null],
    ["No.", "求人受付年月日", "求人事業所名又は求人者氏名", "所在地", "求人職種", "備考"],
  ];
  if (withResults.length === 0) {
    rows.push([1, "実績なし", "", "", "", ""]);
  } else {
    withResults.forEach((p, i) =>
      rows.push([i + 1, p.received_on, p.org_name, p.org_address, p.job_type, p.note]),
    );
  }
  return {
    name: "様式30 求人者リスト",
    rows,
    headerRows: 2,
    columnWidths: [5, 14, 30, 32, 16, 24],
  };
}
