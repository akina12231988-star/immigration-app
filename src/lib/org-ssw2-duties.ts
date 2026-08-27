// 「２号特定技能外国人の業務内容に関する誓約書」（参考様式第１－３２号）の
// 「１ 当該２号特定技能外国人の業務内容」。
// 所属機関ごとに一度登録しておき、同じ会社で２号を申請するたびに自動で入れる。
// 保存先は organizations.ssw2_duties（jsonb・0123）。

export interface OrgSsw2Duties {
  department: string; // ① 所属部署名
  position: string; // ② 役職又は地位
  duties: string; // ③ 当該外国人が従事する具体的な職務内容（製造物・収穫物・作業工程など）
  difference: string; // ④ 技能実習生・1号特定技能外国人との職務内容の違い
}

export const EMPTY_SSW2_DUTIES: OrgSsw2Duties = {
  department: "",
  position: "",
  duties: "",
  difference: "",
};

// 様式の並び順（画面の入力欄・誓約書の出力で使う）
export const SSW2_DUTY_FIELDS: {
  key: keyof OrgSsw2Duties;
  no: string;
  label: string;
  hint?: string;
  multiline?: boolean;
}[] = [
  { key: "department", no: "①", label: "所属部署名" },
  { key: "position", no: "②", label: "役職又は地位" },
  {
    key: "duties",
    no: "③",
    label: "当該外国人が従事する具体的な職務内容",
    hint: "製造物、収穫物、作業工程など。許否に大きく影響するため具体的に書く",
    multiline: true,
  },
  {
    key: "difference",
    no: "④",
    label: "技能実習生・1号特定技能外国人との職務内容の違い",
    hint: "それらの外国人が従事する場合に記載する。分野別方針で定める２号の業務内容と相違のないように",
    multiline: true,
  },
];

// 0123 が未適用でも（列が無く undefined でも）画面が壊れないように読む
export function ssw2DutiesOf(
  source: { ssw2_duties?: unknown } | null | undefined,
): OrgSsw2Duties {
  const raw = (source?.ssw2_duties ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    department: str(raw.department),
    position: str(raw.position),
    duties: str(raw.duties),
    difference: str(raw.difference),
  };
}

// 誓約書に書ける状態か（③は必須。①②も様式の欄なので埋める）
export function ssw2DutiesMissing(d: OrgSsw2Duties): string[] {
  return SSW2_DUTY_FIELDS.filter((f) => f.key !== "difference" && !d[f.key].trim()).map(
    (f) => f.label,
  );
}

// 一度でも登録してあるか（所属機関の画面で「登録済み」を出すため）
export function hasSsw2Duties(source: { ssw2_duties?: unknown } | null | undefined): boolean {
  const d = ssw2DutiesOf(source);
  return SSW2_DUTY_FIELDS.some((f) => d[f.key].trim() !== "");
}
