// 様式30（求人者リスト）の作成。労働局の訪問指導の前に提出する。
//
// 載せるのは「手数料管理簿で入金済みの企業」の求人だけにする運用のため、
// 求人ごとに入金の状況（入金済み／請求済み・未入金／未請求／台帳に無し）を出し、
// 入金済みのものだけを既定で選んだ状態にする。
//
// もらった書式（A4横・6列×15行）にそのまま流し込むので、列と行数は様式に合わせる。

import { A4_LANDSCAPE, type DocxSpec } from "@/lib/docx-export";

// 様式に入る行数（この数を超えて選べないようにする）
export const FORM30_MAX_ROWS = 15;

// 入金の状況。載せてよいのは「入金済み」だけ
export type Form30PayStatus = "入金済み" | "請求済み・未入金" | "未請求" | "台帳に無し";

// 手数料管理簿の1行（判定に使う分だけ）
export interface Form30Fee {
  organization_id: string | null;
  worker_name: string;
  billed_on: string | null;
  paid_on: string | null;
}

// 画面に出す求人1件
export interface Form30Candidate {
  postingId: string;
  organizationId: string | null;
  received_on: string; // 求人受付年月日
  org_name: string; // 求人事業所名又は求人者氏名
  org_address: string; // 所在地
  job_type: string; // 求人職種
  note: string; // 備考
  referred_dates: string[]; // 紹介年月日（応募日）
  payStatus: Form30PayStatus;
  paidOn: string | null; // いちばん新しい入金日
  paidWorkers: string[]; // 入金済みの手数料の対象になった外国人
  // 実績をどうやって見つけたか。
  // 「求人」= 応募がこの求人票に紐づいている（本来の形）
  // 「会社」= 応募が求人票に紐づいていないため、同じ会社の応募で判定した
  matchedBy: "求人" | "会社";
}

// 基準日（訪問予定日）の1年前。過去1年間の実績を見るのに使う
export function oneYearBefore(baseDate: string): string {
  const m = baseDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1]) - 1}-${m[2]}-${m[3]}` : baseDate;
}

// その企業の入金の状況を求める。
// 入金日が入った手数料が1件でもあれば「入金済み」。
// 1件も無ければ、請求済みがあれば「請求済み・未入金」、行はあるが請求前なら「未請求」
export function payStatusOf(
  fees: Form30Fee[],
  organizationId: string | null,
): { status: Form30PayStatus; paidOn: string | null; paidWorkers: string[] } {
  if (!organizationId) return { status: "台帳に無し", paidOn: null, paidWorkers: [] };
  const own = fees.filter((f) => f.organization_id === organizationId);
  if (own.length === 0) return { status: "台帳に無し", paidOn: null, paidWorkers: [] };
  const paid = own.filter((f) => !!f.paid_on);
  if (paid.length > 0) {
    const paidOn = paid.map((f) => f.paid_on ?? "").sort().at(-1) ?? null;
    const names = [...new Set(paid.map((f) => f.worker_name).filter(Boolean))];
    return { status: "入金済み", paidOn, paidWorkers: names };
  }
  const billed = own.some((f) => !!f.billed_on);
  return { status: billed ? "請求済み・未入金" : "未請求", paidOn: null, paidWorkers: [] };
}

// 様式に載せてよいか（入金済みの企業だけ）
export function isEligible(candidate: Form30Candidate): boolean {
  return candidate.payStatus === "入金済み";
}

export interface Form30PostingInput {
  postingId: string;
  organizationId: string | null;
  received_on: string;
  org_name: string;
  org_address: string;
  job_type: string;
  note: string;
  referred_dates: string[]; // この求人票に紐づく応募の応募日
}

// 画面に出す候補。基準日から過去1年間に紹介実績（応募）がある求人を、
// 求人受付年月日の新しい順で返す。
//
// 応募は求人票に紐づける仕組みだが、過去に取り込んだデータなど紐づいていないものもある。
// 求人票で見つからなかった会社は、その会社の応募（orgReferredDates）で拾い直し、
// 「会社で判定した」ことが分かるようにする（取りこぼしを防ぐため）。
export function buildForm30Candidates(
  postings: Form30PostingInput[],
  fees: Form30Fee[],
  baseDate: string,
  orgReferredDates: Record<string, string[]> = {},
): Form30Candidate[] {
  const from = oneYearBefore(baseDate);
  const inPeriod = (dates: string[]) => dates.some((d) => d >= from && d <= baseDate);

  // 求人票に紐づいた実績が1件でもある会社は、そちらだけを使う
  const orgsWithPostingHit = new Set(
    postings
      .filter((p) => p.organizationId && inPeriod(p.referred_dates))
      .map((p) => p.organizationId as string),
  );

  const build = (p: Form30PostingInput, matchedBy: "求人" | "会社"): Form30Candidate => {
    const pay = payStatusOf(fees, p.organizationId);
    return {
      postingId: p.postingId,
      organizationId: p.organizationId,
      received_on: p.received_on,
      org_name: p.org_name,
      org_address: p.org_address,
      job_type: p.job_type,
      note: p.note,
      referred_dates: p.referred_dates,
      payStatus: pay.status,
      paidOn: pay.paidOn,
      paidWorkers: pay.paidWorkers,
      matchedBy,
    };
  };

  const rows: Form30Candidate[] = [];
  for (const p of postings) {
    if (inPeriod(p.referred_dates)) {
      rows.push(build(p, "求人"));
      continue;
    }
    const orgId = p.organizationId;
    if (!orgId || orgsWithPostingHit.has(orgId)) continue;
    if (inPeriod(orgReferredDates[orgId] ?? [])) rows.push(build(p, "会社"));
  }
  return rows.sort((a, b) => (a.received_on > b.received_on ? -1 : 1));
}

// 最初から選んでおくもの（入金済みのうち、様式に入る件数まで）
export function defaultSelection(candidates: Form30Candidate[]): string[] {
  return candidates.filter(isEligible).slice(0, FORM30_MAX_ROWS).map((c) => c.postingId);
}

// ---- 様式30のWord（.docx）----

// 様式の列幅（twips）。A4横の本文の幅 15085 にそろえる
const COLUMN_WIDTHS = [700, 1800, 3600, 4400, 2000, 2585];

export interface Form30DocOptions {
  agencyName: string; // 紹介事業所名称
  baseDate: string; // 訪問予定日
}

// 選んだ求人を様式30のレイアウトに流し込む。
// 実績が無いときは、様式の注意書きどおり1行目に「実績なし」と書く
export function buildForm30Doc(
  rows: Form30Candidate[],
  options: Form30DocOptions,
): DocxSpec {
  const head = [
    "No.",
    "求人受付年月日",
    "求人事業所名又は求人者氏名",
    "所在地",
    "求人職種",
    "備考",
  ];
  const body: string[][] = [];
  if (rows.length === 0) {
    body.push(["1", "実績なし", "", "", "", ""]);
  } else {
    rows.slice(0, FORM30_MAX_ROWS).forEach((r, i) => {
      body.push([
        String(i + 1),
        r.received_on,
        r.org_name,
        r.org_address,
        r.job_type,
        r.note,
      ]);
    });
  }
  // 様式は15行ぶんの枠があるので、余った行は空欄のまま出す
  while (body.length < FORM30_MAX_ROWS) {
    body.push([String(body.length + 1), "", "", "", "", ""]);
  }

  return {
    page: A4_LANDSCAPE,
    fontEast: "ＭＳ 明朝",
    fontAscii: "Century",
    blocks: [
      {
        kind: "paragraph",
        text: `■求人者リスト（訪問予定日から過去１年間の実績）　　　　　　　　　　　　　　　　　　　　紹介事業所名称（　${options.agencyName}　）`,
        bold: true,
        size: 11,
      },
      {
        kind: "table",
        columnWidths: COLUMN_WIDTHS,
        rows: [head, ...body],
        headerRows: 1,
        rowHeight: 397,
        alignCenterColumns: [0, 1],
      },
      { kind: "paragraph", text: "" },
      {
        kind: "paragraph",
        text: "実績がない場合は「実績なし」と記入してください。　　提出先：熊本労働局需給調整事業室　kuma-jukyu@mhlw.go.jp",
        size: 9,
      },
      { kind: "paragraph", text: "（様式30）", size: 9, align: "right" },
    ],
  };
}
