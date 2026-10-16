// 最低賃金の改定に伴う所属機関からの「時給のご確認」の回答の管理と、地域ごとの時給の集計。
//
// 改定のたびに所属機関へ案内を送り、改定後の時給（1号・2号）を返事してもらっている。
// ・どの機関にまだ送っていないか、どの機関から返事がまだかを一覧で管理する
//   （organization_wage_replies。0181）
// ・返事のあった時給、または登録済みの現在の時給を、機関の住所の地域（都道府県・市区町村）
//   ごとに平均・中央値・最低・最高で集計し、地域別最低賃金との差も出す
// 時給の一括登録で改定日以降の時給が入っている機関は、返事をもとに登録済みとみなして
// 自動で「回答あり」にし、その時給（いちばん多い額）を回答の額として使う。
// 画面（/organizations/wage-stats）から切り出して、単体テストできるようにしている。

import { currentWage, hourlyFromMonthly } from "@/lib/wage";
import { isSsw2Residence } from "@/lib/wage-raise";
import { MINIMUM_WAGES, PREFECTURES, minimumWageAt, prefectureFromAddress } from "@/lib/minimum-wage";
import type { WorkerOrgEmploymentStart } from "@/types/db";

// ---- 回答の記録（organization_wage_replies） ----

export const WAGE_REPLY_STATUSES = ["未送付", "送付済", "回答あり", "対象外"] as const;
export type WageReplyStatus = (typeof WAGE_REPLY_STATUSES)[number];

export interface OrganizationWageReply {
  id: string;
  organization_id: string;
  effective_on: string; // 改定後の最低賃金の適用日（回答の回）
  status: WageReplyStatus;
  sent_on: string | null; // 案内を送った日
  replied_on: string | null; // 返事をもらった日
  hourly_ssw1: number | null; // 回答の時給（1号）
  hourly_ssw2: number | null; // 回答の時給（2号）
  monthly_ssw1: number | null; // 回答の月給（1号・0182）。月給で返事が来る機関用
  monthly_ssw2: number | null; // 回答の月給（2号・0182）
  note: string;
  created_at: string;
  updated_at: string;
}

export type OrganizationWageReplyInput = Omit<OrganizationWageReply, "id" | "created_at" | "updated_at">;

// ---- 地域（住所から都道府県・市区町村を読む） ----

export interface OrgRegion {
  prefecture: string; // 例: 熊本県（分からなければ ''）
  city: string; // 例: 八代市・球磨郡あさぎり町（分からなければ ''）
}

export type RegionLevel = "prefecture" | "city";

// 住所から都道府県と市区町村を読み取る。
// 「〒866-0000 熊本県八代市…」→ { 熊本県, 八代市 }、「熊本県球磨郡あさぎり町…」→ { 熊本県, 球磨郡あさぎり町 }
export function regionOfAddress(address: string | null | undefined): OrgRegion {
  const s = (address ?? "")
    .normalize("NFKC")
    .replace(/^\s*〒?\s*\d{3}-?\d{4}\s*/, "")
    .trim();
  const prefecture = prefectureFromAddress(s) ?? "";
  let rest = s;
  if (prefecture) {
    const i = s.indexOf(prefecture);
    rest = s.slice(i + prefecture.length);
  }
  rest = rest.replace(/^[\s,、]+/, "");
  return { prefecture, city: cityOf(rest) };
}

// 都道府県を除いた住所の先頭から市区町村を読む。
// 郡部（「球磨郡あさぎり町」）は郡と町村をつなげる。市より前に郡が無ければ市まで
function cityOf(rest: string): string {
  if (!rest) return "";
  const shi = rest.indexOf("市");
  const gun = rest.indexOf("郡");
  if (gun > 0 && (shi < 0 || gun < shi)) {
    const m = rest.match(/^(.+?郡.+?[町村])/);
    if (m) return m[1];
  }
  if (shi > 0) return rest.slice(0, shi + 1);
  const m = rest.match(/^(.+?[区町村])/);
  return m ? m[1] : "";
}

// 地域の見出し（都道府県ごと／市区町村ごと）。分からなければ「住所未登録・不明」
export function regionKey(region: OrgRegion, level: RegionLevel): string {
  if (level === "prefecture") return region.prefecture || "";
  if (!region.prefecture && !region.city) return "";
  return `${region.prefecture}${region.prefecture && region.city ? " " : ""}${region.city}`;
}

export const UNKNOWN_REGION_LABEL = "住所未登録・不明";

export function regionLabel(region: OrgRegion, level: RegionLevel): string {
  return regionKey(region, level) || UNKNOWN_REGION_LABEL;
}

// ---- 機関ごとの在籍者と時給 ----

export type WageGroup = "1号" | "2号";
export const WAGE_GROUPS: WageGroup[] = ["1号", "2号"];

// 在留資格から 1号・2号 のどちらの時給として扱うか（時給の一括登録と同じ分け方）
export function wageGroupOf(residenceStatus: string | null | undefined): WageGroup {
  return isSsw2Residence(residenceStatus) ? "2号" : "1号";
}

export interface WageStatsOrganization {
  id: string;
  name: string;
  address: string;
  annual_work_hours?: number | null;
}

export interface WageStatsWorker {
  id: string;
  name: string;
  status: string;
  residence_status: string;
  current_organization_id: string | null;
  employment_start_on: string | null;
  org_employment_starts: unknown;
}

export interface WageStatsWage {
  worker_id: string;
  organization_id: string | null;
  kind: string;
  amount: number;
  started_on: string | null;
  created_at: string;
}

export interface OrgWageWorker {
  id: string;
  name: string;
  group: WageGroup;
  currentHourly: number | null; // 現在の時給（月給は年間所定労働時間で時給に換算。できなければ null）
  currentKind: string | null;
  currentStartedOn: string | null;
  hourlyWages: { amount: number; startedOn: string }[]; // この機関での時給の記録（改定日以降の登録を探す）
  monthlyWages: { amount: number; startedOn: string }[]; // この機関での月給の記録
}

export interface OrgWageData {
  org: { id: string; name: string; address: string; annualWorkHours: number }; // 年間所定労働時間（0 = 未登録）
  region: OrgRegion;
  workers: OrgWageWorker[]; // 在籍中の人
}

function startAtOrg(w: WageStatsWorker, organizationId: string): string | null {
  const list = Array.isArray(w.org_employment_starts)
    ? (w.org_employment_starts as Partial<WorkerOrgEmploymentStart>[])
    : [];
  const e = list.find((x) => x && x.organization_id === organizationId && x.start_on);
  return e?.start_on || w.employment_start_on || null;
}

// 機関ごとに在籍中の人と現在の時給をまとめる（全機関。在籍者がいない機関も含む）
export function buildOrgWageData(
  orgs: WageStatsOrganization[],
  workers: WageStatsWorker[],
  wages: WageStatsWage[],
  today: string,
): OrgWageData[] {
  const wagesByWorkerOrg = new Map<string, WageStatsWage[]>();
  for (const w of wages) {
    if (!w.organization_id) continue;
    const key = `${w.worker_id}|${w.organization_id}`;
    (wagesByWorkerOrg.get(key) ?? wagesByWorkerOrg.set(key, []).get(key)!).push(w);
  }
  return orgs.map((org) => {
    const members = workers
      .filter((w) => w.status === "在籍中" && w.current_organization_id === org.id)
      .sort((a, b) => a.name.localeCompare(b.name, "ja"))
      .map((w): OrgWageWorker => {
        const list = wagesByWorkerOrg.get(`${w.id}|${org.id}`) ?? [];
        const startOn = startAtOrg(w, org.id);
        const cur = currentWage(list, today, startOn);
        let hourly: number | null = null;
        if (cur) {
          if (cur.kind === "時給") hourly = cur.amount > 0 ? cur.amount : null;
          else if (cur.kind === "月給") hourly = hourlyFromMonthly(cur.amount, org.annual_work_hours ?? 0);
        }
        const ofKind = (kind: string) =>
          list
            .filter((x) => x.kind === kind && x.amount > 0)
            .map((x) => ({ amount: x.amount, startedOn: x.started_on || startOn || "" }))
            .filter((x) => x.startedOn);
        return {
          id: w.id,
          name: w.name,
          group: wageGroupOf(w.residence_status),
          currentHourly: hourly,
          currentKind: cur?.kind ?? null,
          currentStartedOn: cur ? cur.started_on || startOn : null,
          hourlyWages: ofKind("時給"),
          monthlyWages: ofKind("月給"),
        };
      });
    return {
      org: { id: org.id, name: org.name, address: org.address ?? "", annualWorkHours: org.annual_work_hours ?? 0 },
      region: regionOfAddress(org.address),
      workers: members,
    };
  });
}

// いちばん多い額（同数なら低いほう）。空なら null
export function modeAmount(amounts: number[]): number | null {
  if (amounts.length === 0) return null;
  const counts = new Map<number, number>();
  for (const a of amounts) counts.set(a, (counts.get(a) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [a, c] of counts) {
    if (c > bestCount || (c === bestCount && best !== null && a < best)) {
      best = a;
      bestCount = c;
    }
  }
  return best;
}

export interface DerivedReplyAmounts {
  hourly: Record<WageGroup, number | null>;
  monthly: Record<WageGroup, number | null>;
}

// 改定日以降に適用が始まる時給・月給が登録されていれば、その額（1号・2号それぞれ、いちばん多い額）。
// 時給の一括登録で返事の内容を入れた機関は、ここから自動で「回答あり」とみなす
export function derivedReplyAmounts(data: OrgWageData, effectiveOn: string): DerivedReplyAmounts {
  const pick = (group: WageGroup, key: "hourlyWages" | "monthlyWages") =>
    modeAmount(
      data.workers
        .filter((w) => w.group === group)
        .flatMap((w) => w[key].filter((x) => x.startedOn >= effectiveOn).map((x) => x.amount)),
    );
  return {
    hourly: { "1号": pick("1号", "hourlyWages"), "2号": pick("2号", "hourlyWages") },
    monthly: { "1号": pick("1号", "monthlyWages"), "2号": pick("2号", "monthlyWages") },
  };
}

export function hasAnyAmount(d: DerivedReplyAmounts): boolean {
  return WAGE_GROUPS.some((g) => d.hourly[g] !== null || d.monthly[g] !== null);
}

// ---- 回答状況の一覧 ----

export interface WageReplyView {
  data: OrgWageData;
  reply: OrganizationWageReply | null; // 記録済みの行（無ければ null）
  status: WageReplyStatus; // 表示上の状況（記録が無く、改定日以降の時給が登録済みなら自動で「回答あり」）
  autoReplied: boolean; // 登録済みの時給から自動で「回答あり」にしたか
  hourly: Record<WageGroup, number | null>; // 回答の時給（記録を優先し、無ければ登録済みの時給から）
  hourlyFromWages: Record<WageGroup, boolean>; // その額が登録済みの時給からのものか
  monthly: Record<WageGroup, number | null>; // 回答の月給（記録を優先し、無ければ登録済みの月給から）
  monthlyFromWages: Record<WageGroup, boolean>;
  counts: Record<WageGroup, number>; // 在籍者数
}

export function buildWageReplyViews(
  list: OrgWageData[],
  replies: OrganizationWageReply[],
  effectiveOn: string,
): WageReplyView[] {
  const byOrg = new Map(replies.filter((r) => r.effective_on === effectiveOn).map((r) => [r.organization_id, r]));
  return list.map((data) => {
    const reply = byOrg.get(data.org.id) ?? null;
    const derived = derivedReplyAmounts(data, effectiveOn);
    const hasDerived = hasAnyAmount(derived);
    const recorded = reply?.status ?? "未送付";
    // 記録が「対象外」「回答あり」ならそのまま。未送付・送付済でも時給・月給が登録済みなら回答あり
    const autoReplied = hasDerived && recorded !== "対象外" && recorded !== "回答あり";
    const status: WageReplyStatus = autoReplied ? "回答あり" : recorded;
    const hourly: Record<WageGroup, number | null> = {
      "1号": reply?.hourly_ssw1 ?? derived.hourly["1号"],
      "2号": reply?.hourly_ssw2 ?? derived.hourly["2号"],
    };
    const monthly: Record<WageGroup, number | null> = {
      "1号": reply?.monthly_ssw1 ?? derived.monthly["1号"],
      "2号": reply?.monthly_ssw2 ?? derived.monthly["2号"],
    };
    return {
      data,
      reply,
      status,
      autoReplied,
      hourly,
      hourlyFromWages: {
        "1号": reply?.hourly_ssw1 == null && derived.hourly["1号"] !== null,
        "2号": reply?.hourly_ssw2 == null && derived.hourly["2号"] !== null,
      },
      monthly,
      monthlyFromWages: {
        "1号": reply?.monthly_ssw1 == null && derived.monthly["1号"] !== null,
        "2号": reply?.monthly_ssw2 == null && derived.monthly["2号"] !== null,
      },
      counts: {
        "1号": data.workers.filter((w) => w.group === "1号").length,
        "2号": data.workers.filter((w) => w.group === "2号").length,
      },
    };
  });
}

export function countByStatus(views: WageReplyView[]): Record<WageReplyStatus, number> {
  const counts = { 未送付: 0, 送付済: 0, 回答あり: 0, 対象外: 0 } as Record<WageReplyStatus, number>;
  for (const v of views) counts[v.status] += 1;
  return counts;
}

// ---- 地域ごとの集計 ----

export interface WageSample {
  orgId: string;
  region: OrgRegion;
  group: WageGroup;
  hourly: number;
}

export type WageStatsSource = "replies" | "current";

// 回答の時給。時給の回答が無く月給の回答があれば、年間所定労働時間で時給に換算（できなければ null）
export function replyHourly(view: WageReplyView, group: WageGroup): number | null {
  const h = view.hourly[group];
  if (h != null && h > 0) return h;
  const m = view.monthly[group];
  if (m != null && m > 0) return hourlyFromMonthly(m, view.data.org.annualWorkHours);
  return null;
}

// 回答のあった時給（機関ごとに1号・2号それぞれ1件。月給の回答は時給に換算）
export function samplesFromReplies(views: WageReplyView[]): WageSample[] {
  const out: WageSample[] = [];
  for (const v of views) {
    if (v.status !== "回答あり") continue;
    for (const g of WAGE_GROUPS) {
      const h = replyHourly(v, g);
      if (h != null && h > 0) out.push({ orgId: v.data.org.id, region: v.data.region, group: g, hourly: h });
    }
  }
  return out;
}

// 登録済みの現在の時給（在籍者1人につき1件）
export function samplesFromCurrentWages(list: OrgWageData[]): WageSample[] {
  const out: WageSample[] = [];
  for (const d of list) {
    for (const w of d.workers) {
      if (w.currentHourly != null && w.currentHourly > 0) {
        out.push({ orgId: d.org.id, region: d.region, group: w.group, hourly: w.currentHourly });
      }
    }
  }
  return out;
}

export interface GroupStat {
  count: number; // 件数（回答なら機関数、現在の時給なら人数）
  orgCount: number; // 機関数
  average: number; // 平均（円・四捨五入）
  median: number; // 中央値
  min: number;
  max: number;
}

export interface RegionStat {
  key: string; // 並べ替え・絞り込み用（'' は不明）
  label: string;
  prefecture: string;
  orgCount: number; // この地域で件数に入った機関数
  minimum: number | null; // 地域別最低賃金（都道府県が分かるとき）
  groups: Record<WageGroup, GroupStat | null>;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2] : Math.round((s[n / 2 - 1] + s[n / 2]) / 2);
}

export function groupStat(samples: WageSample[]): GroupStat | null {
  if (samples.length === 0) return null;
  const values = samples.map((s) => s.hourly);
  return {
    count: values.length,
    orgCount: new Set(samples.map((s) => s.orgId)).size,
    average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

// 地域ごと（都道府県または市区町村）にまとめる。地域名の順（不明は最後）
export function regionStats(
  samples: WageSample[],
  level: RegionLevel,
  minimumFor: (prefecture: string) => number | null,
): RegionStat[] {
  const byKey = new Map<string, WageSample[]>();
  for (const s of samples) {
    const key = regionKey(s.region, level);
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(s);
  }
  return [...byKey.entries()]
    .map(([key, list]): RegionStat => {
      const prefecture = list[0]?.region.prefecture ?? "";
      return {
        key,
        label: key || UNKNOWN_REGION_LABEL,
        prefecture,
        orgCount: new Set(list.map((s) => s.orgId)).size,
        minimum: prefecture ? minimumFor(prefecture) : null,
        groups: {
          "1号": groupStat(list.filter((s) => s.group === "1号")),
          "2号": groupStat(list.filter((s) => s.group === "2号")),
        },
      };
    })
    .sort((a, b) => {
      // 不明は最後。都道府県は北から南の順、同じ都道府県の中は件数の多い順
      if (!a.key) return 1;
      if (!b.key) return -1;
      const pa = PREFECTURES.indexOf(a.prefecture);
      const pb = PREFECTURES.indexOf(b.prefecture);
      if (pa !== pb) return pa - pb;
      const ca = sampleCount(a);
      const cb = sampleCount(b);
      if (ca !== cb) return cb - ca;
      return a.key.localeCompare(b.key, "ja");
    });
}

function sampleCount(r: RegionStat): number {
  return (r.groups["1号"]?.count ?? 0) + (r.groups["2号"]?.count ?? 0);
}

// 全体（地域をまとめた1行）
export function overallStat(samples: WageSample[]): RegionStat {
  return {
    key: "__all",
    label: "全体",
    prefecture: "",
    orgCount: new Set(samples.map((s) => s.orgId)).size,
    minimum: null,
    groups: {
      "1号": groupStat(samples.filter((s) => s.group === "1号")),
      "2号": groupStat(samples.filter((s) => s.group === "2号")),
    },
  };
}

// その回（改定）で比べる最低賃金。改定の都道府県は画面で入れた改定後の額、
// ほかの都道府県は表にある適用日時点の額（表より先の日付なら最新の額）
export function minimumWageForRound(
  prefecture: string,
  round: { prefecture: string; hourly: number; effectiveOn: string },
): number | null {
  if (prefecture === round.prefecture && round.hourly > 0) return round.hourly;
  return minimumWageAt(prefecture, round.effectiveOn)?.hourly ?? MINIMUM_WAGES[prefecture]?.hourly ?? null;
}

// 「1,100」「１１００円」などを数値にする。空・0 は null
export function parseHourlyInput(input: string): number | null {
  const digits = (input ?? "").normalize("NFKC").replace(/[^0-9]/g, "");
  const n = digits ? Number(digits) : 0;
  return n > 0 ? n : null;
}

export function yen(n: number | null | undefined): string {
  return n == null ? "" : `${n.toLocaleString("ja-JP")}円`;
}

// 最低賃金との差の表示（+58円 / −10円）
export function diffText(value: number | null | undefined, minimum: number | null): string {
  if (value == null || minimum == null) return "";
  const d = value - minimum;
  return d >= 0 ? `+${d.toLocaleString("ja-JP")}円` : `−${Math.abs(d).toLocaleString("ja-JP")}円`;
}

// ---- Excel 出力 ----

import type { SheetSpec } from "@/lib/xlsx-export";

export const SOURCE_LABELS: Record<WageStatsSource, string> = {
  replies: "回答のあった時給",
  current: "登録済みの現在の時給",
};

export const LEVEL_LABELS: Record<RegionLevel, string> = {
  prefecture: "都道府県ごと",
  city: "市区町村ごと",
};

// 回答状況のシート（機関1行）
export function buildWageRepliesSheet(views: WageReplyView[], effectiveOn: string): SheetSpec {
  const rows = views.map((v) => [
    v.data.org.name,
    regionLabel(v.data.region, "city"),
    v.counts["1号"] + v.counts["2号"],
    v.counts["1号"],
    v.counts["2号"],
    v.status + (v.autoReplied ? "（登録済みの時給から）" : ""),
    v.reply?.sent_on ?? "",
    v.reply?.replied_on ?? "",
    v.hourly["1号"],
    v.monthly["1号"],
    v.hourly["2号"],
    v.monthly["2号"],
    v.reply?.note ?? "",
  ]);
  return {
    name: `回答状況 ${effectiveOn}`,
    headerRows: 1,
    columnWidths: [28, 22, 8, 8, 8, 18, 12, 12, 12, 12, 12, 12, 30],
    rows: [
      ["所属機関", "地域", "在籍者", "うち1号", "うち2号", "状況", "送付日", "回答日", "1号の時給", "1号の月給", "2号の時給", "2号の月給", "備考"],
      ...rows,
    ],
  };
}

// 地域ごとの集計のシート（地域1行＋全体）
export function buildRegionStatsSheet(
  stats: RegionStat[],
  overall: RegionStat,
  level: RegionLevel,
  source: WageStatsSource,
): SheetSpec {
  const cell = (g: GroupStat | null) => (g ? [g.count, g.average, g.median, g.min, g.max] : [null, null, null, null, null]);
  const row = (r: RegionStat) => [
    r.label,
    r.orgCount,
    ...cell(r.groups["1号"]),
    ...cell(r.groups["2号"]),
    r.minimum,
    r.minimum != null && r.groups["1号"] ? r.groups["1号"].average - r.minimum : null,
  ];
  return {
    name: `地域別 ${LEVEL_LABELS[level]}`,
    headerRows: 2,
    columnWidths: [24, 8, 8, 10, 10, 10, 10, 8, 10, 10, 10, 10, 12, 14],
    rows: [
      [`${SOURCE_LABELS[source]}（${LEVEL_LABELS[level]}）`, "", "1号", "", "", "", "", "2号", "", "", "", "", "", ""],
      ["地域", "機関数", "件数", "平均", "中央値", "最低", "最高", "件数", "平均", "中央値", "最低", "最高", "最低賃金", "1号平均との差"],
      ...stats.map(row),
      row(overall),
    ],
  };
}
