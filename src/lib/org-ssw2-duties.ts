// 「２号特定技能外国人の業務内容に関する誓約書」（参考様式第１－３２号）の
// 「１ 当該２号特定技能外国人の業務内容」。
// 所属機関ごとに一度登録しておき、同じ会社で２号を申請するたびに自動で入れる。
// 保存先は organizations.ssw2_duties（jsonb・0123）。

export interface OrgSsw2Duties {
  department: string; // ① 所属部署名
  position: string; // ② 役職又は地位
  duties: string; // ③ 当該外国人が従事する具体的な職務内容（製造物・収穫物・作業工程など）
  difference: string; // ④ 技能実習生・1号特定技能外国人との職務内容の違い
  // 「２ 指導を受ける対象者一覧」の共通の内容。対象者が全員同じことが多いので、
  // 所属機関に一度入れておけば、対象者ごとの欄が空のときにこれを使う
  instructee_office: string; // 事業所及び所属部署名
  instructee_position: string; // 役職又は地位
  instructee_duties: string; // 指導を受ける職務内容
}

export const EMPTY_SSW2_DUTIES: OrgSsw2Duties = {
  department: "",
  position: "",
  duties: "",
  difference: "",
  instructee_office: "",
  instructee_position: "",
  instructee_duties: "",
};

// 様式の並び順（画面の入力欄・誓約書に貼る文章で使う）
export type Ssw2DutyKey = "department" | "position" | "duties" | "difference";

export const SSW2_DUTY_FIELDS: {
  key: Ssw2DutyKey;
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

// 「２ 指導を受ける対象者一覧」の共通の内容（所属機関の画面で入力する欄）
export type Ssw2InstructeeDefaultKey = "instructee_office" | "instructee_position" | "instructee_duties";

export const SSW2_INSTRUCTEE_DEFAULT_FIELDS: {
  key: Ssw2InstructeeDefaultKey;
  label: string;
  placeholder: string;
}[] = [
  { key: "instructee_office", label: "事業所及び所属部署名", placeholder: "例: 本社農場　農業部門" },
  { key: "instructee_position", label: "役職又は地位", placeholder: "例: 耕種農業の一般社員" },
  { key: "instructee_duties", label: "指導を受ける職務内容", placeholder: "例: トマトの栽培や仕事の段取り" },
];

// 対象者の欄が空なら、所属機関の共通の内容で埋める（対象者ごとに入れた内容が優先）
export function withInstructeeDefaults<
  T extends { office: string; position: string; duties: string },
>(row: T, duties: OrgSsw2Duties): T {
  return {
    ...row,
    office: row.office.trim() || duties.instructee_office.trim(),
    position: row.position.trim() || duties.instructee_position.trim(),
    duties: row.duties.trim() || duties.instructee_duties.trim(),
  };
}

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
    instructee_office: str(raw.instructee_office),
    instructee_position: str(raw.instructee_position),
    instructee_duties: str(raw.instructee_duties),
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
