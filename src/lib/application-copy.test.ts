import { describe, expect, it } from "vitest";
import { buildApplicationCopyGroups, copyGroupText, desiredResidenceStatus, totalStaff, wageForApplication, ymdParts } from "./application-copy";
import { emptyOrganizationIntake } from "./organization-intake";
import { CUSTODIAN_INFO } from "./custody";
import { contractPeriodEnd, formatYmdJa } from "./support-plan-dates";
import type { WorkerWage } from "@/types/db";
import type { WorkHistory } from "@/types/ssw";

const worker = {
  name: "BUI NGOC TUAN",
  kana: "ブイ ゴック トゥアン",
  nationality: "ベトナム",
  birth: "1995-04-02",
  gender: "男",
  has_spouse: "無",
  field: "農業",
  home_address: "THAI BINH - VIET NAM",
  address: "熊本県阿蘇郡西原村大字布田1173番地２",
  passport_no: "C2970924",
  passport_expiry_date: "2027-03-30",
  residence_status: "特定技能1号",
  residence_period: "1年",
  residence_permit_date: null,
  residence_expiry_date: "2024-10-13",
  residence_card_no: "NP86724592RG",
  employment_start_on: "2024-05-15",
};
const org = { name: "藤本　未和", industry: "農業", business_category: "耕種農業", address: "熊本県阿蘇郡西原村大字小森383番地", contact: "096-279-3534", corporate_no: "" };
const wage = (patch: Partial<WorkerWage>): WorkerWage => ({
  id: "w1", worker_id: "x", organization_id: null, kind: "月給", amount: 182070, started_on: "2024-05-15", reason: "採用時", note: "", detail: null, created_at: "2024-05-01", updated_at: "2024-05-01", ...patch,
});

describe("雇用契約期間と日付の部品", () => {
  it("雇用開始日から2年間（終了は2年後の前日）", () => {
    expect(contractPeriodEnd("2024-05-15")).toBe("2025-05-14".replace("2025", "2026"));
    expect(contractPeriodEnd("2026-11-29")).toBe("2028-11-28");
    expect(contractPeriodEnd("2024-02-29")).toBe("2026-02-28");
    expect(formatYmdJa("2026-11-29")).toBe("2026年11月29日");
    expect(ymdParts("1995-04-02")).toEqual(["1995", "4", "2"]);
    expect(ymdParts("")).toBeUndefined();
  });
});

describe("登録支援機関の上書き", () => {
  it("custodian を渡すとその内容で出る", () => {
    const groups = buildApplicationCopyGroups({
      worker, org: null, intake: null, wages: [], histories: [], planDates: {},
      custodian: { ...CUSTODIAN_INFO, supportStaffName: "秋吉 伽恋", registeredOn: "2021-03-24" },
    });
    const find = (label: string) => groups.flatMap((g) => g.items).find((i) => i.label === label);
    expect(find("5 (11)支援担当者名")?.value).toBe("秋吉 伽恋");
    expect(find("5 (10)支援責任者名")?.value).toBe("VUONG VAN THANH");
  });
});

describe("申請書に貼る項目", () => {
  const intake = { ...emptyOrganizationIntake(), posting_weekly_hours: "40", posting_monthly_hours: "173時間20分", posting_annual_hours: "2080", koyo_no: "4301-625629-8", rep_name: "藤本　未和", staff_japanese: "8", staff_ssw1: "2", support_fee: "10,000（税別）", pay_method: "口座振込", health_insurance: "社会保険", rosai_covered: "はい", koyo_covered: "はい" };
  const histories: WorkHistory[] = [
    { id: "h1", visa: "特定技能1号", start: "2023-10-01", end: null, org: "藤本　辰博（菜未ファーム）", role: "", note: "" },
    { id: "h2", visa: "技能実習", start: "2017-11-01", end: "2021-07-31", org: "荒木農園", role: "", note: "" },
  ];

  it("外国人・所属機関・賃金・職歴・日付から項目を組み立てる", () => {
    const groups = buildApplicationCopyGroups({
      worker, org, intake, wages: [wage({})], histories, planDates: { es: "2024-05-15" }, desiredStatus: "特定技能1号", today: "2025-05-01",
    });
    const find = (label: string) => groups.flatMap((g) => g.items).find((i) => i.label === label);
    expect(find("2 生年月日")).toMatchObject({ value: "1995年4月2日", parts: ["1995", "4", "2"] });
    expect(find("11 在留期間")?.value).toBe("1年");
    expect(find("13 希望する在留資格")?.value).toBe("特定技能1号");
    // 登録支援機関の欄は既定値で出て、その場で編集できる（app_settings に保存）
    expect(find("5 (11)支援担当者名")).toMatchObject({ value: "VUONG VAN THANH", edit: { target: "custodian", column: "supportStaffName" } });
    expect(find("5 (7)登録年月日")).toMatchObject({ value: "2021年3月24日", editValue: "2021-03-24", edit: { target: "custodian", column: "registeredOn", kind: "date" } });
    expect(find("5 (12)対応可能言語")?.edit).toBeUndefined();
    expect(find("2 (1)雇用契約期間")).toMatchObject({ value: "2024年5月15日 から 2026年5月14日 まで", parts: ["2024", "5", "15", "2026", "5", "14"] });
    expect(find("2 (3)所定労働時間（週平均）")?.value).toBe("40");
    expect(find("2 (3)所定労働時間（月平均）")?.value).toBe("173.3");
    // 登録済みの値を編集するときは、表示値ではなく保存されている値を入力欄に入れる
    expect(find("2 生年月日")?.editValue).toBe("1995-04-02");
    expect(find("2 (3)所定労働時間（月平均）")?.editValue).toBe("173時間20分");
    expect(find("健康保険及び厚生年金保険の適用事業所")).toMatchObject({ value: "有", editValue: "社会保険" });
    expect(find("3 (10)所在地")).toMatchObject({ value: org.address, editValue: "" });
    expect(find("3 氏名")?.editValue).toBeUndefined();
    expect(find("2 (4)月額報酬")?.value).toBe("182070");
    expect(find("2 (4)基本給の時間換算額")?.value).toBe(String(Math.round((182070 * 12) / 2080)));
    expect(find("3 (8)常勤職員数")?.value).toBe("10");
    expect(find("健康保険及び厚生年金保険の適用事業所")?.value).toBe("有");
    expect(find("5 (12)対応可能言語")?.value).toBe("ベトナム語");
    expect(find("5 (6)登録番号")?.value).toBe("20登-005746");
    const careers = groups.find((g) => g.title.includes("職歴"))!.items;
    expect(careers[0]).toMatchObject({ value: "2017年11月〜2021年7月 荒木農園", parts: ["2017", "11", "2021", "7", "荒木農園"] });
    expect(careers[1].value).toContain("〜現在");
    expect(find("21 申請時における特定技能1号での通算在留期間")?.parts).toEqual(["1", "7"]);
    expect(copyGroupText(groups[1])).toContain("17 特定技能所属機関 (1)氏名又は名称: 藤本　未和");
  });

  it("合格証（日本語・専門外・2件目以降）と良好に修了した技能実習2号を申請人等作成用2に出す", () => {
    const groups = buildApplicationCopyGroups({
      worker: {
        ...worker,
        cert_senmongai_name: "外国人食品産業技能評価機構",
        cert_senmongai_location: "日本国内",
        cert_nihongo_name: "日本語能力試験　JLPT",
        cert_nihongo_location: "ベトナム",
        cert_nihongo_level: "N4",
        cert_exams: [
          { id: "a1", kind: "nihongo", name: "国際交流基金日本語基礎テスト", location: "日本国内", level: "", doc_key: "cert_nihongo_a1" },
          { id: "b2", kind: "senmongai", name: "", location: "", level: "", doc_key: "cert_senmongai_b2" },
        ],
        specialty_grade: "農業（耕種）専門級",
        jisshu2_shokushu: "耕種農業",
        jisshu2_sagyo: "施設園芸",
        jisshu2_proof: "実技試験の合格",
      },
      org, intake, wages: [], histories: [], planDates: {}, today: "2025-05-01",
    });
    const g = groups.find((x) => x.title.startsWith("申請人等作成用 2"))!;
    const find = (label: string) => g.items.find((i) => i.label === label);
    expect(find("18 技能水準 (1)試験名")?.value).toBe("外国人食品産業技能評価機構");
    expect(find("18 (2)受験地")?.value).toBe("日本国内");
    expect(find("18 専門級の合格名（技能実習）")?.value).toBe("農業（耕種）専門級");
    expect(find("19 日本語能力 (1)試験名")?.value).toBe("日本語能力試験　JLPT");
    expect(find("19 (2)受験地")?.value).toBe("ベトナム");
    expect(find("19 レベル")).toMatchObject({ value: "N4", edit: { target: "worker", column: "cert_nihongo_level" } });
    // 2件目以降は件数付きで出す。空の受験情報は出さない
    expect(find("19 (1)試験名（2件目）")?.value).toBe("国際交流基金日本語基礎テスト");
    expect(find("18 (1)試験名（2件目）")).toBeUndefined();
    expect(find("20 技能実習2号良好修了 (1)職種名")?.value).toBe("耕種農業");
    expect(find("20 (2)作業名")?.value).toBe("施設園芸");
    expect(find("20 (3)良好修了の証明方法")?.value).toBe("実技試験の合格");
    // 未登録ならその場で入力できる編集先が付く
    const empty = buildApplicationCopyGroups({ worker, org, intake, wages: [], histories: [], planDates: {} });
    const item = empty.flatMap((x) => x.items).find((i) => i.label === "20 (2)作業名");
    expect(item).toMatchObject({ value: "", edit: { target: "worker", column: "jisshu2_sagyo" } });
  });

  it("未登録は空。時給なら月額に換算する", () => {
    const groups = buildApplicationCopyGroups({ worker: { ...worker, passport_no: "" }, org: null, intake: null, wages: [], histories: [], planDates: {} });
    const find = (label: string) => groups.flatMap((g) => g.items).find((i) => i.label === label);
    expect(find("10 旅券 (1)番号")?.value).toBe("");
    expect(find("17 特定技能所属機関 (1)氏名又は名称")?.value).toBe("");
    expect(find("2 (1)雇用契約期間")?.value).toBe("2024年5月15日 から 2026年5月14日 まで"); // 雇用開始年月日から
    expect(copyGroupText(groups[0])).toContain("10 旅券 (1)番号: 未登録");
    expect(totalStaff(null)).toBe("");
    const h = wageForApplication([wage({ kind: "時給", amount: 1050 })], intake, "2024-05-15");
    expect(h).toMatchObject({ hourly: "1050", monthly: String(Math.round((1050 * 2080) / 12)) });
  });
});

describe("desiredResidenceStatus", () => {
  it("申請内容と申請種別から希望する在留資格を決める", () => {
    expect(desiredResidenceStatus("特定技能申請準備中", "変更", "特定活動")).toBe("特定技能1号");
    expect(desiredResidenceStatus("特定技能2号申請準備中", "変更", "特定技能1号")).toBe("特定技能2号");
    expect(desiredResidenceStatus("特定活動（特定技能２号移行準備のため）準備中", "特定活動", "特定技能1号")).toBe("特定活動");
    expect(desiredResidenceStatus("特定活動で申請準備中", "特定活動", "技能実習3号")).toBe("特定活動");
    expect(desiredResidenceStatus("特定技能更新の準備中", "更新", "特定技能1号")).toBe("特定技能1号");
    expect(desiredResidenceStatus("在留資格認定申請書の準備中", "認定", "")).toBe("特定技能1号");
    expect(desiredResidenceStatus("", "", "")).toBe("");
  });
});
