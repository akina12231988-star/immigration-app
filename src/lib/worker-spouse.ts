import type { WorkerSpouse } from "@/types/db";

// 配偶者の情報（workers.spouse jsonb）。
//
// 配偶者の有無が「有」のときに記録する。
// 日本に住んでいる配偶者がこのシステムに外国人として登録されていれば、その人とリンクする
// （worker_id）。登録が無ければ、氏名・生年月日・同居の有無・在留カード番号・勤務先を直接入れる。

// 同居の有無の選択肢
export const SPOUSE_LIVING_OPTIONS = ["同居", "別居"] as const;

export function emptyWorkerSpouse(): WorkerSpouse {
  return {
    worker_id: "",
    name: "",
    birth: "",
    lives_together: "",
    residence_card_no: "",
    workplace: "",
  };
}

// 保存された jsonb（空・項目が欠けていることがある）を、欠けを既定値で埋めた形にする
export function normalizeWorkerSpouse(raw: unknown): WorkerSpouse {
  const base = emptyWorkerSpouse();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
  return {
    worker_id: str(r.worker_id, base.worker_id),
    name: str(r.name, base.name),
    birth: str(r.birth, base.birth),
    lives_together: str(r.lives_together, base.lives_together),
    residence_card_no: str(r.residence_card_no, base.residence_card_no),
    workplace: str(r.workplace, base.workplace),
  };
}

// 何か入っているか（リンクしている、または1つでも記入がある）
export function hasSpouseInfo(spouse: WorkerSpouse): boolean {
  return Object.values(spouse).some((v) => (v ?? "").trim() !== "");
}

// システムに登録がある外国人とリンクしているか
export function isLinkedSpouse(spouse: WorkerSpouse): boolean {
  return spouse.worker_id.trim() !== "";
}

// 画面に出す1行の要約（リンクしているときは、リンク先の氏名などを linked で渡す）
export function spouseSummary(
  spouse: WorkerSpouse,
  linked?: { name?: string; birth?: string | null; residence_card_no?: string } | null,
): string {
  const name = (linked?.name || spouse.name).trim();
  const birth = (linked?.birth || spouse.birth || "").trim();
  const cardNo = (linked?.residence_card_no || spouse.residence_card_no).trim();
  return (
    [
      name || "氏名未登録",
      birth && `生年月日 ${birth}`,
      spouse.lives_together && spouse.lives_together,
      cardNo && `在留カード番号 ${cardNo}`,
      spouse.workplace.trim() && `勤務先 ${spouse.workplace.trim()}`,
    ]
      .filter(Boolean)
      .join(" ・ ")
  );
}

// 保存する形にそろえる。
// リンクしているときは、氏名・生年月日・在留カード番号はリンク先の外国人の登録を見るので持たない
// （二重に持つと、相手の登録を直したときに食い違うため）。同居の有無と勤務先は配偶者ごとの情報なので残す
export function cleanWorkerSpouse(spouse: WorkerSpouse): WorkerSpouse {
  const s: WorkerSpouse = {
    worker_id: spouse.worker_id.trim(),
    name: spouse.name.trim(),
    birth: spouse.birth.trim(),
    lives_together: spouse.lives_together.trim(),
    residence_card_no: spouse.residence_card_no.trim(),
    workplace: spouse.workplace.trim(),
  };
  if (!s.worker_id) return s;
  return { ...s, name: "", birth: "", residence_card_no: "" };
}
