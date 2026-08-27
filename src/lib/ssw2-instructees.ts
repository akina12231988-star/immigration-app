// 特定技能2号の申請で出す「２号特定技能外国人の業務内容に関する誓約書」
// （参考様式第１－３２号）の「２ 当該２号特定技能外国人に指導を受ける対象者一覧」。
//
// 2号を申請する外国人が指導する相手（対象者）を、所属機関の中から選んで記録する。
// 保存先は ssw2_instructees（0120）。

export interface Ssw2Instructee {
  id: string;
  worker_id: string; // 2号を申請する外国人
  target_worker_id: string | null; // 対象者がアプリに登録のある外国人のとき、その人
  name: string; // 対象者の氏名
  residence_card_no: string; // 在留カード番号（外国人のみ）
  office: string; // 事業所及び所属部署名
  position: string; // 役職又は地位
  duties: string; // 指導を受ける職務内容
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type Ssw2InstructeeInput = Omit<
  Ssw2Instructee,
  "id" | "created_at" | "updated_at"
>;

// 様式の「準備の内容（只今の状況）」がこの値のときだけ、指導対象者の欄を出す
export const SSW2_PREP_SITUATION = "特定技能2号申請準備中";

// 様式の（参考）「特定産業分野ごとの指導を受ける必要な対象者数」。
// 記載の無い分野は「対象者が不在でも差し支えない」ため 0 とする。
export const SSW2_REQUIRED_INSTRUCTEES: { field: string; count: number; note?: string }[] = [
  { field: "ビルクリーニング", count: 2 },
  { field: "工業製品製造業", count: 2 },
  { field: "建設", count: 2 },
  { field: "造船・舶用工業", count: 2 },
  { field: "自動車整備", count: 1 },
  { field: "航空", count: 1, note: "空港グランドハンドリング区分のみ1名以上" },
  { field: "宿泊", count: 2 },
  { field: "農業", count: 2 },
  { field: "漁業", count: 0 },
  { field: "飲食料品製造業", count: 2 },
  { field: "外食業", count: 0 },
];

// 外国人の「特定産業分野・職種」（workers.field）から必要な対象者数を求める。
// 分野名は「農業（耕種農業全般）」のように後ろに区分が付くことがあるので、前方一致で見る。
export function requiredInstructeeCount(field: string): number {
  const f = (field ?? "").trim();
  if (!f) return 0;
  const hit = SSW2_REQUIRED_INSTRUCTEES.find((r) => f.startsWith(r.field) || f.includes(r.field));
  return hit?.count ?? 0;
}

// 必要数に足りているか。足りていないときは画面に注意を出す
export function instructeeShortage(field: string, count: number): number {
  return Math.max(0, requiredInstructeeCount(field) - count);
}

// 対象者として書ける状態か（氏名が入っていること）。
// 様式は氏名・事業所及び所属部署名・役職又は地位・指導を受ける職務内容の4つを埋める
export function instructeeMissingFields(row: Ssw2InstructeeInput): string[] {
  const missing: string[] = [];
  if (!row.name.trim()) missing.push("氏名");
  if (!row.office.trim()) missing.push("事業所及び所属部署名");
  if (!row.position.trim()) missing.push("役職又は地位");
  if (!row.duties.trim()) missing.push("指導を受ける職務内容");
  // 登録のある外国人を選んだときは在留カード番号も要る（様式の注記）
  if (row.target_worker_id && !row.residence_card_no.trim()) missing.push("在留カード番号");
  return missing;
}

// 対象者に選べる人の候補。
//  ・同じ所属機関にいる（様式の留意事項3: 同一の事業所に出勤する者に限る）
//  ・本人（2号を申請する人）は除く
//  ・退職した人は除く
//  ・すでに他の2号申請者の対象者になっている人は takenBy に誰が押さえているかを入れる
//    （様式の留意事項4: 他の2号特定技能外国人に指導を受けている者は記載しない）
export interface InstructeeCandidateWorker {
  id: string;
  name: string;
  status: string;
  field?: string;
  residence_status?: string;
  residence_card_no?: string;
  current_situation?: string;
  current_organization_id?: string | null;
}

export interface InstructeeCandidate {
  id: string;
  name: string;
  residenceStatus: string; // 現在の在留資格（候補の横に出す）
  workerStatus: string; // 在籍中・申請準備中など（候補の横に出す）
  residence_card_no: string;
  takenBy: string | null; // すでに押さえている2号申請者の氏名。空いていれば null
}

// すでに特定技能2号を持っている人か。
// 2号の人は「指導を受ける対象者」にはならないので候補に出さない。
// 全角の「２号」で登録されていても同じ扱いにする
export function isSsw2Holder(residenceStatus: string | null | undefined): boolean {
  const s = (residenceStatus ?? "").replace(/２/g, "2").trim();
  // 「特定活動（特定技能2号移行準備）」はまだ2号ではないので対象者にできる
  if (s.includes("特定活動")) return false;
  return s.includes("特定技能2号");
}

// 対象者に選べる人の候補。
//  ・本人（2号を申請する人）と退職した人は除く
//  ・同じ所属機関の人だけ（様式の留意事項3: 同一の事業所に出勤する者に限る）。
//    ほかの機関の人・日本人は、画面で氏名を直接入力する
//  ・すでに特定技能2号を持っている人は除く（指導する側なので対象者にならない）
//  ・すでに他の2号申請者の対象者になっている人は takenBy に誰が押さえているかを入れる
//    （様式の留意事項4: 他の2号特定技能外国人に指導を受けている者は記載しない）
export function instructeeCandidates(
  workers: InstructeeCandidateWorker[],
  opts: {
    selfWorkerId: string;
    organizationId: string | null | undefined;
    takenBy: Map<string, string>;
  },
): InstructeeCandidate[] {
  const { selfWorkerId, organizationId, takenBy } = opts;
  return workers
    .filter((w) => w.id !== selfWorkerId)
    .filter((w) => w.status !== "退職")
    .filter((w) => !isSsw2Holder(w.residence_status))
    // 所属機関が分かっているときは、その機関に在籍している人だけ
    .filter((w) => !organizationId || w.current_organization_id === organizationId)
    .map((w) => ({
      id: w.id,
      name: w.name,
      residenceStatus: (w.residence_status ?? "").trim(),
      workerStatus: (w.status ?? "").trim(),
      residence_card_no: w.residence_card_no ?? "",
      takenBy: takenBy.get(w.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

// 候補の横に出す説明（在留資格・在籍の状態・すでに押さえられているか）
export function candidateNote(c: InstructeeCandidate): string {
  const parts = [c.residenceStatus || "在留資格未登録", c.workerStatus || "状態未登録"];
  if (c.takenBy) parts.push(`${c.takenBy}さんの対象者のため選べません`);
  return parts.join("・");
}

// ---- 所属機関ごとの「２号を何人まで受け入れられるか」 ----

// この機関の分野。在籍している外国人の分野のうち、いちばん多いものを使う
// （所属機関の業種は自由入力なので、様式の分野名と一致しないことがある）
export function orgSsw2Field(workers: { field?: string; status: string }[]): string {
  const count = new Map<string, number>();
  for (const w of workers) {
    const f = (w.field ?? "").trim();
    if (!f || w.status === "退職") continue;
    count.set(f, (count.get(f) ?? 0) + 1);
  }
  let best = "";
  let max = 0;
  for (const [f, n] of count) {
    if (n > max) {
      best = f;
      max = n;
    }
  }
  return best;
}

export interface Ssw2Applicant {
  workerId: string;
  name: string;
  field: string;
  instructeeCount: number; // いま登録してある対象者の人数
}

export interface Ssw2Capacity {
  field: string; // 判定に使った分野
  required: number; // 2号1人あたりに必要な対象者の人数（0 = 決まりなし）
  applicants: number; // いま2号の準備をしている人数
  shortage: number; // 準備中の人たちを満たすのに、あと何人の対象者が要るか
  free: number; // まだ誰の対象者にもなっていない、選べる人数
  more: number | null; // あと何人まで新しく2号を受け入れられるか（null = 決まりなし）
}

// この機関が、いまの人数であと何人２号を受け入れられるかを見積もる。
//  free（空いている候補）から、準備中の人に足りないぶん（shortage）を先に引き、
//  残りを1人あたりの必要人数で割る。
export function ssw2Capacity(input: {
  field: string;
  applicants: Ssw2Applicant[];
  free: number;
}): Ssw2Capacity {
  const required = requiredInstructeeCount(input.field);
  const shortage = input.applicants.reduce(
    (sum, a) => sum + Math.max(0, requiredInstructeeCount(a.field || input.field) - a.instructeeCount),
    0,
  );
  const rest = input.free - shortage;
  return {
    field: input.field,
    required,
    applicants: input.applicants.length,
    shortage,
    free: input.free,
    more: required > 0 ? Math.max(0, Math.floor(rest / required)) : null,
  };
}
