// 健康診断の有効期限は「受診日の1年後」。今日がその日以前なら有効。

// 受診日（YYYY-MM-DD）→ 有効期限（YYYY-MM-DD）。1年後に同じ日が無い場合（2/29）は月末に丸める。
export function healthCheckValidUntil(examOn: string | null): string {
  if (!examOn) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(examOn);
  if (!m) return "";
  const day = Number(m[3]);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, day));
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

// 今日時点でまだ有効か（有効期限当日までは有効）。受診日未設定は無効扱い。
export function isHealthCheckValid(examOn: string | null, today: string): boolean {
  const until = healthCheckValidUntil(examOn);
  return !!until && today <= until;
}

// 健康診断書に必要な受診項目（健康診断個人票 13号様式相当）。病院書式のとき、これらが
// 揃っているかをチェックする。1〜3号の公式様式に医師が記入している場合はチェック不要。
export const HEALTH_EXAM_ITEMS: { id: string; label: string }[] = [
  { id: "history", label: "既往歴・業務歴" },
  { id: "symptoms", label: "自覚症状・他覚症状" },
  { id: "physique", label: "身長・体重・BMI・腹囲" },
  { id: "vision", label: "視力" },
  { id: "hearing", label: "聴力（1000Hz・4000Hz）" },
  { id: "chest_xray", label: "胸部エックス線検査（結核等）" },
  { id: "blood_pressure", label: "血圧" },
  { id: "anemia", label: "貧血検査（血色素量・赤血球数）" },
  { id: "liver", label: "肝機能検査（GOT・GPT・γ-GTP）" },
  { id: "lipids", label: "血中脂質検査（LDL・HDL・トリグリセライド）" },
  { id: "blood_sugar", label: "血糖検査" },
  { id: "urine", label: "尿検査（糖・蛋白）" },
  { id: "ecg", label: "心電図検査" },
];

export type HealthFormType = "" | "official" | "hospital";

export interface HealthCheckDetail {
  form_type: HealthFormType;
  checked_items: string; // カンマ区切りの項目ID（病院書式のとき）
  needs_followup: boolean;
  followup_memo: string;
  followup_result: string;
}

export const EMPTY_HEALTH_DETAIL: HealthCheckDetail = {
  form_type: "",
  checked_items: "",
  needs_followup: false,
  followup_memo: "",
  followup_result: "",
};

export function parseCheckedItems(csv: string): Set<string> {
  return new Set(
    csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// 病院書式で全受診項目が確認済みか
export function allExamItemsChecked(detail: HealthCheckDetail): boolean {
  const checked = parseCheckedItems(detail.checked_items);
  return HEALTH_EXAM_ITEMS.every((i) => checked.has(i.id));
}

// 健康診断書として「揃っている」か。
// - ファイルがあり、受診日が1年以内で有効なことが前提
// - 公式様式(1〜3号): 項目チェック不要。ただし要精査等で就労可を後日もらう必要がある場合は、
//   その後の結果（followup_result）が記録されるまで未完了
// - 病院書式: 受診項目がすべて確認済みなら完了
export function isHealthDetailComplete(
  detail: HealthCheckDetail,
  hasFile: boolean,
  examOn: string | null,
  today: string,
): boolean {
  if (!hasFile || !isHealthCheckValid(examOn, today)) return false;
  if (detail.form_type === "official") {
    return detail.needs_followup ? detail.followup_result.trim().length > 0 : true;
  }
  if (detail.form_type === "hospital") {
    return allExamItemsChecked(detail);
  }
  return false; // 様式未選択
}
