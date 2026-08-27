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
  residence_card_no?: string;
  current_organization_id?: string | null;
}

export interface InstructeeCandidate {
  id: string;
  name: string;
  residence_card_no: string;
  takenBy: string | null; // すでに押さえている2号申請者の氏名。空いていれば null
}

export function instructeeCandidates(
  workers: InstructeeCandidateWorker[],
  opts: {
    selfWorkerId: string;
    organizationId: string | null | undefined;
    // 対象者として使われている外国人ID → 押さえている2号申請者の氏名
    takenBy: Map<string, string>;
  },
): InstructeeCandidate[] {
  const { selfWorkerId, organizationId, takenBy } = opts;
  return workers
    .filter((w) => w.id !== selfWorkerId)
    .filter((w) => w.status !== "退職")
    // 所属機関が分かっているときは同じ会社の人だけ。分からないときは絞らない
    .filter((w) => !organizationId || w.current_organization_id === organizationId)
    .map((w) => ({
      id: w.id,
      name: w.name,
      residence_card_no: w.residence_card_no ?? "",
      takenBy: takenBy.get(w.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}
